// Exercita as MESMAS chamadas do site contra o Supabase local (supabase start),
// com Auth real. Imprime só contagens/OK — nada de dados pessoais.
// Uso: bash supabase/tests/api/run_api.sh
const { createRequire } = require('module')
const [SITE, URL, KEY, RA, EMAIL, PG] = process.argv.slice(2)
const { createClient } = createRequire(SITE + '/package.json')('@supabase/supabase-js')
const { execFileSync } = require('child_process')

const novo = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const sql = (q) => execFileSync('docker', ['exec', PG, 'psql', '-U', 'postgres', '-At', '-c', q]).toString().trim()
const emailAdmin = (ra) => `admin.${ra}@mutiroes.invalid`

let falhas = 0
async function t(nome, fn) {
  try {
    const r = await fn()
    console.log('  ok  ', nome, r === undefined ? '' : `→ ${r}`)
  } catch (e) {
    falhas++
    console.log('  FALHA', nome, '→', e?.message ?? e, e?.code ?? '')
  }
}
const ok = (r) => { if (r.error) throw r.error; return r.data }
const deveFalhar = async (p) => { const r = await p; if (!r.error) throw new Error('deveria ter sido recusado'); return 'recusado: ' + r.error.message.slice(0, 70) }
async function todos(montar) {
  const out = []
  for (let de = 0; ; de += 1000) { const p = ok(await montar(de, de + 999)); out.push(...p); if (p.length < 1000) return out }
}

;(async () => {
  const pub = novo()
  const RA_ADM = '900001', RA_ORG = '900002', SENHA = 'senha-teste-123'

  console.log('PÚBLICO (sem login)')
  await t('consultar RA importado', async () => { const c = ok(await pub.rpc('consultar_ra', { p_ra: RA })); if (!c) throw new Error('vazio'); if ('email' in c) throw new Error('vazou e-mail'); return `${c.participacoes.length} participações, ${c.horas.horas_acumuladas} h` })
  await t('consultar RA inexistente → null', async () => String(ok(await pub.rpc('consultar_ra', { p_ra: '000000' }))))
  await t('ler participantes direto', () => deveFalhar(pub.from('participantes').select('id')))
  await t('ler inscrições direto', () => deveFalhar(pub.from('inscricoes').select('id')))
  await t('cursos (formulário)', async () => ok(await pub.from('cursos').select('id, nome')).length + ' cursos')
  await t('cadastro no Auth sem convite', () => deveFalhar(pub.auth.signUp({ email: 'alguem@gmail.com', password: SENHA })))

  console.log('PRIMEIRO ADMIN (convite pelo SQL Editor + primeiro acesso)')
  sql(`insert into convites_admin (ra, nome, papel) values ('${RA_ADM}', 'Admin Teste', 'admin') on conflict (ra) do nothing`)
  const adm = novo()
  await t('primeiro acesso (signUp com convite)', async () => { const r = ok(await adm.auth.signUp({ email: emailAdmin(RA_ADM), password: SENHA })); if (!r.session) throw new Error('sem sessão'); return 'sessão criada' })
  await t('login RA + senha', async () => { ok(await adm.auth.signInWithPassword({ email: emailAdmin(RA_ADM), password: SENHA })); return 'ok' })
  await t('senha errada', () => deveFalhar(novo().auth.signInWithPassword({ email: emailAdmin(RA_ADM), password: 'errada-123' })))
  await t('papel carregado', async () => ok(await adm.from('organizadores').select('*').eq('user_id', (await adm.auth.getUser()).data.user.id).maybeSingle()).papel)

  console.log('ORGANIZAÇÃO')
  let ev
  await t('painel: contagens', async () => { const p = await adm.from('participantes').select('id', { count: 'exact', head: true }); if (p.error) throw p.error; return p.count + ' participantes' })
  await t('planilha: todas as inscrições (paginado)', async () => (await todos((a, b) => adm.from('inscricoes').select('id, participante_id, evento_id, status').order('id').range(a, b))).length + ' inscrições')
  await t('criar evento aberto com pergunta obrigatória', async () => {
    ev = ok(await adm.from('eventos').insert({ titulo: 'Teste API', inicio: new Date(Date.now() + 864e5).toISOString(), horas: 4, vagas: 1, status: 'inscricoes_abertas',
      perguntas: [{ id: 'carona', rotulo: 'Precisa de carona?', tipo: 'sim_nao', obrigatoria: true }] }).select('id').single()).id
    return 'id ' + ev
  })
  await t('evento aparece na lista pública', async () => { const l = ok(await pub.rpc('listar_eventos_abertos')); if (!l.some((e) => e.id === ev)) throw new Error('não apareceu'); return l.length + ' abertos' })

  console.log('INSCRIÇÃO PÚBLICA')
  await t('aluno importado com e-mail errado', () => deveFalhar(pub.rpc('inscrever_publico', { p_evento_id: ev, p_ra: RA, p_email: 'errado@x.com', p_respostas: { carona: 'Sim' } })))
  await t('sem resposta obrigatória', () => deveFalhar(pub.rpc('inscrever_publico', { p_evento_id: ev, p_ra: RA, p_email: EMAIL })))
  await t('aluno importado (e-mail em maiúsculas)', async () => JSON.stringify(ok(await pub.rpc('inscrever_publico', { p_evento_id: ev, p_ra: RA, p_email: EMAIL.toUpperCase(), p_respostas: { carona: 'Sim' } }))))
  await t('aluno novo (lotado → espera)', async () => ok(await pub.rpc('inscrever_publico', { p_evento_id: ev, p_ra: '900099', p_email: 'novo.api@example.com', p_dados: { nome: 'Novo Teste', curso_id: null, celular: '19 9' }, p_respostas: { carona: 'Não' } })).status)
  await t('externo sem RA', async () => ok(await pub.rpc('inscrever_publico', { p_evento_id: ev, p_ra: null, p_email: 'externo.api@example.com', p_dados: { nome: 'Externo Teste' }, p_respostas: { carona: 'Não' } })).status)
  await t('cancelar com e-mail certo → 1º da espera promovido', async () => {
    ok(await pub.rpc('cancelar_inscricao_publico', { p_evento_id: ev, p_ra: RA, p_email: EMAIL }))
    return sql(`select status from inscricoes i join participantes p on p.id=i.participante_id where p.ra='900099' and i.evento_id=${ev}`)
  })

  console.log('PRESENÇA E VALIDAÇÃO')
  await t('organização marca presença do novo aluno', async () => {
    const pid = sql(`select id from participantes where ra='900099'`)
    ok(await adm.from('inscricoes').update({ status: 'presente' }).eq('evento_id', ev).eq('participante_id', pid))
    return sql(`select presenca_registrada_por is not null from inscricoes where evento_id=${ev} and status='presente'`) === 't' ? 'carimbado' : '?'
  })
  await t('consulta mostra 4 h', async () => ok(await pub.rpc('consultar_ra', { p_ra: '900099' })).horas.horas_acumuladas)
  await t('pedir validação: e-mail errado', () => deveFalhar(pub.rpc('solicitar_validacao_publico', { p_ra: '900099', p_email: 'x@x.com', p_horas: 1 })))
  await t('pedir 5 h (só tem 4)', () => deveFalhar(pub.rpc('solicitar_validacao_publico', { p_ra: '900099', p_email: 'novo.api@example.com', p_horas: 5 })))
  await t('pedir 3 h', async () => 'id ' + ok(await pub.rpc('solicitar_validacao_publico', { p_ra: '900099', p_email: 'novo.api@example.com', p_horas: 3 })))
  await t('organização aprova (carimbo)', async () => {
    ok(await adm.from('solicitacoes_validacao').update({ status: 'aprovada' }).eq('status', 'pendente').eq('participante_id', sql(`select id from participantes where ra='900099'`)))
    const c = ok(await pub.rpc('consultar_ra', { p_ra: '900099' }))
    return `validadas ${c.horas.horas_validadas}, disponíveis ${c.horas.horas_disponiveis}`
  })

  console.log('EQUIPE')
  await t('admin convida organizador', async () => { ok(await adm.from('convites_admin').upsert({ ra: RA_ORG, nome: 'Org Teste', papel: 'organizador' })) })
  const org = novo()
  await t('convidado faz primeiro acesso', async () => { ok(await org.auth.signUp({ email: emailAdmin(RA_ORG), password: SENHA })); return 'ok' })
  await t('organizador NÃO convida', () => deveFalhar(org.from('convites_admin').insert({ ra: '900003', nome: 'X' })))
  await t('organizador lê participantes', async () => { const p = await org.from('participantes').select('id', { count: 'exact', head: true }); if (p.error) throw p.error; return p.count })
  await t('não remove o último admin', () => deveFalhar(adm.rpc('remover_organizador', { p_user_id: sql(`select user_id from organizadores where ra='${RA_ADM}'`) })))
  await t('redefinir acesso do organizador', async () => {
    ok(await adm.rpc('redefinir_acesso_admin', { p_user_id: sql(`select user_id from organizadores where ra='${RA_ORG}'`) }))
    const r = await novo().auth.signInWithPassword({ email: emailAdmin(RA_ORG), password: SENHA })
    if (!r.error) throw new Error('senha antiga ainda vale')
    ok(await novo().auth.signUp({ email: emailAdmin(RA_ORG), password: 'nova-senha-456' }))
    ok(await novo().auth.signInWithPassword({ email: emailAdmin(RA_ORG), password: 'nova-senha-456' }))
    return 'senha antiga recusada, nova funciona'
  })
  await t('trocar a própria senha', async () => { ok(await adm.auth.updateUser({ password: 'outra-senha-789' })); ok(await novo().auth.signInWithPassword({ email: emailAdmin(RA_ADM), password: 'outra-senha-789' })); return 'ok' })

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas ? 1 : 0)
})()
