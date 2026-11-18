// Exercita as MESMAS consultas do site contra PostgREST + banco com os dados importados.
// Imprime só contagens/OK — nada de dados pessoais.
const { createRequire } = require('module')
const crypto = require('crypto')
const SITE = process.argv[2]
const req = createRequire(SITE + '/package.json')
const { createClient } = req('@supabase/supabase-js')

const PGRST = 'http://127.0.0.1:3999'
const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres!!'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function jwt(claims) {
  const h = b64({ alg: 'HS256', typ: 'JWT' })
  const p = b64({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 })
  const s = crypto.createHmac('sha256', SEGREDO).update(`${h}.${p}`).digest('base64url')
  return `${h}.${p}.${s}`
}
// supabase-js fala com <url>/rest/v1; o PostgREST puro responde na raiz
// e, como o gateway do Supabase, não repassa a chave publicável (não-JWT) como Bearer
const fetchProxy = (u, init = {}) => {
  const h = new Headers(init.headers)
  if ((h.get('Authorization') ?? '').includes('sb_publishable')) h.delete('Authorization')
  return fetch(String(u).replace('http://supabase.local/rest/v1', PGRST), { ...init, headers: h })
}
const cliente = (token) =>
  createClient('http://supabase.local', 'sb_publishable_teste', {
    global: { fetch: fetchProxy },
    ...(token ? { accessToken: async () => token } : {}),
  })

let falhas = 0
async function t(nome, fn) {
  try {
    const r = await fn()
    console.log('  ok  ', nome, r === undefined ? '' : `→ ${r}`)
  } catch (e) {
    falhas++
    console.log('  FALHA', nome, '→', e?.message ?? e, e?.code ?? '', e?.details ?? '', e?.hint ?? '')
  }
}
const ok = (r) => { if (r.error) throw r.error; return r.data }
async function todos(montar) {
  const out = []
  for (let de = 0; ; de += 1000) { const p = ok(await montar(de, de + 999)); out.push(...p); if (p.length < 1000) return out }
}

;(async () => {
  const [ADM, ALU] = process.argv.slice(3) // "uid,email"
  const [admUid, admEmail] = ADM.split(',')
  const [aluUid, aluEmail] = ALU.split(',')
  const adm = cliente(jwt({ sub: admUid, role: 'authenticated', email: admEmail }))
  const alu = cliente(jwt({ sub: aluUid, role: 'authenticated', email: aluEmail }))
  const anon = cliente(null)

  console.log('ANÔNIMO')
  await t('vê eventos', async () => ok(await anon.from('eventos').select('id')).length + ' eventos')
  await t('NÃO lê participantes', async () => {
    const r = await anon.from('participantes').select('id')
    if (!r.error) throw new Error('anon leu participantes!')
    return `recusado (${r.error.code})`
  })
  await t('cursos para o formulário', async () => ok(await anon.from('cursos').select('id, nome').order('nome')).length + ' cursos')

  console.log('ALUNO (cadastro importado, 1º login)')
  let pid
  await t('vincular_minha_conta', async () => { const l = ok(await alu.rpc('vincular_minha_conta')); pid = l[0]?.id; if (!pid) throw new Error('não vinculou'); return '1 cadastro' })
  await t('organizadores (deve vir vazio)', async () => String(ok(await alu.from('organizadores').select('papel').eq('user_id', aluUid).maybeSingle())))
  await t('saldo_horas', async () => { const s = ok(await alu.from('saldo_horas').select('*').eq('participante_id', pid).maybeSingle()); return `acumuladas=${s.horas_acumuladas} disp=${s.horas_disponiveis}` })
  await t('inscricoes + eventos (embed)', async () => ok(await alu.from('inscricoes').select('*, eventos(titulo, inicio, horas, status, local)').eq('participante_id', pid)).length + ' inscrições')
  await t('só enxerga a si mesmo', async () => { const n = ok(await alu.from('participantes').select('id')).length; if (n !== 1) throw new Error(n + ' visíveis'); return '1' })
  await t('só enxerga as próprias inscrições', async () => { const l = ok(await alu.from('inscricoes').select('participante_id')); if (l.some((x) => x.participante_id !== pid)) throw new Error('vazou'); return l.length })
  await t('solicitações / ajustes', async () => `${ok(await alu.from('solicitacoes_validacao').select('*').eq('participante_id', pid)).length} / ${ok(await alu.from('ajustes_horas').select('*').eq('participante_id', pid)).length}`)
  await t('listar_eventos_aluno', async () => ok(await alu.rpc('listar_eventos_aluno')).length + ' eventos')
  await t('perfil: atualizar celular (permitido)', async () => { ok(await alu.from('participantes').update({ celular: '19 90000-0000' }).eq('id', pid)) })
  await t('perfil: trocar RA (deve recusar)', async () => { const r = await alu.from('participantes').update({ ra: '000001' }).eq('id', pid); if (!r.error) throw new Error('aceitou!'); return 'recusado' })

  console.log('ORGANIZAÇÃO (admin)')
  await t('painel: contagens', async () => {
    const p = await adm.from('participantes').select('id', { count: 'exact', head: true })
    const s = await adm.from('solicitacoes_validacao').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
    if (p.error || s.error) throw p.error || s.error
    return `${p.count} participantes, ${s.count} pendentes`
  })
  await t('eventos + resumo + categorias', async () => {
    const [e, r, c] = await Promise.all([todos((a, b) => adm.from('eventos').select('*').order('inicio', { ascending: false }).range(a, b)), todos((a, b) => adm.from('resumo_eventos').select('*').range(a, b)), adm.from('categorias_evento').select('id, nome')])
    ok(c); return `${e.length} eventos, ${r.length} resumos`
  })
  await t('participantes + saldo (paginado)', async () => `${(await todos((a, b) => adm.from('participantes').select('*').order('nome').range(a, b))).length} / ${(await todos((a, b) => adm.from('saldo_horas').select('*').range(a, b))).length}`)
  await t('planilha: todas inscrições (paginação >1000?)', async () => (await todos((a, b) => adm.from('inscricoes').select('id, participante_id, evento_id, status, origem, respostas, presenca_registrada_em, criado_em').order('id').range(a, b))).length + ' inscrições')
  await t('detalhe evento: evento + categoria', async () => ok(await adm.from('eventos').select('*, categorias_evento(nome)').eq('id', 72).single()).titulo ? 'ok' : '?')
  await t('detalhe evento: inscritos + participantes + cursos', async () => (await todos((a, b) => adm.from('inscricoes').select('*, participantes(*, cursos(nome))').eq('evento_id', 72).order('criado_em').range(a, b))).length + ' inscritos')
  await t('busca participante (or + ilike com aspas)', async () => ok(await adm.from('participantes').select('*').or('nome.ilike."%a%",ra.ilike."%a%",email.ilike."%unicamp.br%"').limit(15)).length + ' resultados')
  await t('busca com ponto e @ no termo', async () => ok(await adm.from('participantes').select('*').or('nome.ilike."%@dac.unicamp%",ra.ilike."%@dac.unicamp%",email.ilike."%@dac.unicamp%"').limit(15)).length + ' resultados')
  await t('solicitações + participante (embed)', async () => (await todos((a, b) => adm.from('solicitacoes_validacao').select('*, participantes(nome, ra, email)').eq('status', 'pendente').order('solicitado_em').range(a, b))).length + ' pendentes')
  await t('organizadores + nomes', async () => ok(await adm.from('organizadores').select('*').order('criado_em')).length + ' membros')
  await t('organizadores: achar por e-mail digitado com maiúsculas (site converte)', async () => { const p = ok(await adm.from('participantes').select('user_id, nome').eq('email', aluEmail.toUpperCase().trim().toLowerCase()).maybeSingle()); if (!p) throw new Error('não achou'); return 'achou' })
  await t('banco normaliza e-mail gravado com maiúsculas', async () => {
    const r = ok(await adm.from('participantes').insert({ nome: '  Teste   Normalizacao ', email: ' Teste.NORM@Example.com ', tipo: 'externo' }).select('email, nome').single())
    if (r.email !== 'teste.norm@example.com' || r.nome !== 'Teste Normalizacao') throw new Error(JSON.stringify(r)); return 'minúsculo e sem espaços'
  })

  let novo
  await t('criar evento com formulário', async () => {
    const d = ok(await adm.from('eventos').insert({ titulo: 'Teste API', inicio: new Date(Date.now() + 864e5).toISOString(), horas: 3, vagas: 1, status: 'inscricoes_abertas',
      perguntas: [{ id: 'carona', rotulo: 'Precisa de carona?', tipo: 'sim_nao', obrigatoria: true }] }).select('id').single())
    novo = d.id; return 'id ' + novo
  })
  await t('aluno: inscrever sem resposta obrigatória (recusa)', async () => { const r = await alu.rpc('inscrever_em_evento', { p_evento_id: novo, p_respostas: {} }); if (!r.error) throw new Error('aceitou'); return r.error.message })
  await t('aluno: inscrever', async () => ok(await alu.rpc('inscrever_em_evento', { p_evento_id: novo, p_respostas: { carona: 'Sim' } })))
  await t('admin: incluir outro manualmente (excede vagas, ok p/ org)', async () => {
    const outro = ok(await adm.from('participantes').select('id').neq('id', pid).limit(1).single())
    ok(await adm.from('inscricoes').insert({ participante_id: outro.id, evento_id: novo, status: 'inscrito', origem: 'manual' }))
  })
  await t('presença: marcar presente (carimbo automático)', async () => {
    ok(await adm.from('inscricoes').update({ status: 'presente' }).eq('evento_id', novo).eq('participante_id', pid))
    const i = ok(await adm.from('inscricoes').select('presenca_registrada_em, presenca_registrada_por').eq('evento_id', novo).eq('participante_id', pid).single())
    if (!i.presenca_registrada_em || i.presenca_registrada_por !== admUid) throw new Error('sem carimbo'); return 'carimbado pelo admin'
  })
  await t('presença: restantes como ausentes', async () => { ok(await adm.from('inscricoes').update({ status: 'ausente' }).eq('evento_id', novo).eq('status', 'inscrito')) })
  await t('evento realizado', async () => { ok(await adm.from('eventos').update({ status: 'realizado' }).eq('id', novo)) })
  await t('aluno: saldo subiu 3h', async () => { const s = ok(await alu.from('saldo_horas').select('*').eq('participante_id', pid).single()); return `acumuladas=${s.horas_acumuladas} disp=${s.horas_disponiveis}` })
  let sol
  await t('aluno: solicitar 1h', async () => { sol = ok(await alu.rpc('solicitar_validacao', { p_horas: 1 })); return 'id ' + sol })
  await t('aluno: aprovar a própria (sem efeito)', async () => { ok(await alu.from('solicitacoes_validacao').update({ status: 'aprovada' }).eq('id', sol)); const s = ok(await adm.from('solicitacoes_validacao').select('status').eq('id', sol).single()); if (s.status !== 'pendente') throw new Error('aprovou!'); return 'continua pendente' })
  await t('admin: recusar com motivo', async () => { ok(await adm.from('solicitacoes_validacao').update({ status: 'recusada', observacao: 'teste' }).eq('id', sol).eq('status', 'pendente')) })
  await t('admin: ajuste +2h e remoção', async () => {
    const a = ok(await adm.from('ajustes_horas').insert({ participante_id: pid, horas: 2, motivo: 'teste API' }).select('id').single())
    ok(await adm.from('ajustes_horas').delete().eq('id', a.id))
  })
  await t('admin: editar RA/e-mail do aluno (permitido p/ org)', async () => {
    const p = ok(await adm.from('participantes').select('ra').eq('id', pid).single())
    ok(await adm.from('participantes').update({ observacoes: 'teste' }).eq('id', pid))
    ok(await adm.from('participantes').update({ ra: p.ra, observacoes: null }).eq('id', pid))
  })

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas ? 1 : 0)
})()
