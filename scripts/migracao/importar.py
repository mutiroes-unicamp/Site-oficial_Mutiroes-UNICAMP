"""Gera o SQL de importação da planilha legada + Forms para o banco novo.

Uso:
    python3 -I scripts/migracao/importar.py /caminho/para/Data

Saída (dentro de Data/saida/, fora do repositório — contém dados pessoais):
    importacao.sql            transação única; aplicar no Supabase (SQL editor ou psql)
    relatorio_importacao.md   decisões tomadas e pendências para a organização

O SQL termina com uma conferência: se as horas acumuladas/validadas de qualquer
participante diferirem da planilha, a transação inteira é desfeita.

Regras:
  * RG e CPF dos Forms são ignorados (decisão da organização).
  * Presença vem da matriz "Controle de Horas", ligada a Eventos POR POSIÇÃO
    (é assim que a fórmula da planilha calcula as horas).
  * Linhas duplicadas (mesmo RA + e-mail) são fundidas.
  * Somas manuais nas fórmulas ("+3+8+5") viram ajustes_horas.
  * Inscritos dos Forms sem marcação na matriz entram como status 'inscrito'.
"""
import collections
import datetime as dt
import glob
import json
import os
import re
import sys
import unicodedata
import uuid
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xlsx import read_xlsx  # noqa: E402

BR = dt.timezone(dt.timedelta(hours=-3))  # Brasília, sem horário de verão desde 2019
NS_UUID = uuid.UUID("6f6a1c1e-0000-4000-8000-6d7574697265")  # ids estáveis entre execuções

# Correções de dados confirmadas por evidência nos próprios arquivos
CORRECOES_DATA = {
    # Form "[58ª Edição] Adote Pets (29_08)" e o dia da semana "Sábado" indicam 29/08
    "Evento 58 - Pets no Parque 7": "29/08/2026 - Sábado - 10:30h",
}
STATUS_MATRIZ = {"PARTICIPOU": "presente", "NÃO PARTICIPOU": "ausente", "NAO PARTICIPOU": "ausente",
                 "NÃO CONSEGUIU VAGA": "sem_vaga", "NAO CONSEGUIU VAGA": "sem_vaga"}
PRIORIDADE = {"presente": 3, "ausente": 2, "sem_vaga": 1, "inscrito": 0}
# Colunas dos Forms que NÃO vão para `respostas` (dados cadastrais ou proibidos)
CAMPOS_CADASTRO = ("carimbo de data/hora", "endereco de e-mail", "nome completo", "ra", "ra 2", "rg", "cpf",
                   "celular", "telefone", "curso", "ano de ingresso", "idade", "sexo")


# ------------------------------------------------------------------ util
def g(r, i):
    return r[i] if r is not None and len(r) > i else None


def nt(v):
    """normalização para comparar: sem acento, minúsculo, espaços colapsados"""
    s = unicodedata.normalize("NFKD", str(v or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def limpo(v):
    if v is None:
        return None
    s = re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(v))).strip()
    return s or None


def ra_valido(v):
    if v is None:
        return None
    s = re.sub(r"\.0$", "", str(v).strip())
    return s if re.fullmatch(r"\d{5,6}", s) else None


def ra_bruto_digitos(v):
    s = re.sub(r"\D", "", re.sub(r"\.0$", "", str(v or "").strip()))
    return s or None


def email_ok(v):
    s = (limpo(v) or "").lower().replace(" ", "")
    return s if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", s) else None


def inteiro(v, lo, hi):
    try:
        n = int(float(str(v).replace(",", ".")))
    except (TypeError, ValueError):
        return None
    return n if lo <= n <= hi else None


def num(v):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def genero(v):
    k = nt(v)
    if k in ("masculino", "maculino", "m"):
        return "Masculino"
    if k in ("feminino", "f"):
        return "Feminino"
    if k in ("nao binario", "nb", "nao-binario"):
        return "Não binário"
    return None if k in ("", "-", "--", "---") else limpo(v)


def sim_nao(v):
    k = nt(v)
    if k.startswith("sim"):
        return True
    if k.startswith("nao"):
        return False
    return None


def serial_para_ts(v):
    """número de série do Sheets/Excel -> timestamptz (horário de Brasília)"""
    f = num(v)
    if f is None:
        return None
    base = dt.datetime(1899, 12, 30, tzinfo=BR)
    return base + dt.timedelta(days=f)


def parse_data_evento(s):
    m = re.match(r"\s*(\d{2})/(\d{2})/(\d{2,4})", s or "")
    if not m:
        return None
    y = int(m.group(3))
    y = y + 2000 if y < 100 else y
    hora, minuto = 8, 0
    resto = (s or "")[m.end():]
    mh = re.search(r"(\d{1,2})\s*(?:[:h]\s*(\d{2}))?\s*h?\s*$", resto.strip())
    if mh:
        hora = int(mh.group(1))
        minuto = int(mh.group(2) or 0)
    return dt.datetime(y, int(m.group(2)), int(m.group(1)), hora, minuto, tzinfo=BR)


def categoria(nome):
    k = nt(nome)
    if "gatos da lagoa" in k or "tampinha" in k:
        return "Gatos da Lagoa"
    if any(w in k for w in ("pets", "adocao", "adote")):
        return "Feira de adoção"
    if "agrofloresta" in k:
        return "Agrofloresta"
    if any(w in k for w in ("coleta", "rios limpos", "brigada")):
        return "Coleta de lixo"
    return "Outros"


def q(v):
    """literal SQL"""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, dt.datetime):
        return "'" + v.isoformat() + "'"
    return "'" + str(v).replace("'", "''") + "'"


def qj(d):
    return q(json.dumps(d, ensure_ascii=False)) + "::jsonb"


# ------------------------------------------------------------------ main
def main(base):
    ctrl_path = os.path.join(base, "Controle de Presença - Mutirões.xlsx")
    wb = read_xlsx(ctrl_path)
    dp = wb["Dados_Participantes"][1:]
    ev_rows = [r for r in wb["Eventos"][1:] if g(r, 0)]
    ch = wb["Controle de Horas"]
    ch_rows = ch[3:]
    hist = [r for r in wb["Historico"][1:] if any(r)]
    rel = collections.defaultdict(list)  # seção -> linhas do relatório

    # ---------------- cursos (canonicaliza grafias)
    variantes = collections.defaultdict(collections.Counter)
    for r in dp:
        c = limpo(g(r, 4))
        if c and nt(c) not in ("-", "--", "---"):
            variantes[nt(c)][c] += 1

    def escolher(cnt):
        # mais frequente; desempate: com acento e iniciais maiúsculas
        return max(cnt, key=lambda c: (cnt[c], c != nt(c), c[:1].isupper()))

    curso_canon = {k: escolher(cnt) for k, cnt in variantes.items()}

    def curso_de(v):
        c = limpo(v)
        if not c or nt(c) in ("-", "--", "---"):
            return None
        k = nt(c)
        if k not in curso_canon:
            curso_canon[k] = c
        return curso_canon[k]

    # ---------------- eventos
    eventos = []
    for k, r in enumerate(ev_rows):
        original = limpo(r[0])
        data_txt = CORRECOES_DATA.get(original, g(r, 3))
        if original in CORRECOES_DATA:
            rel["Correções aplicadas"].append(f"{original}: data '{limpo(g(r, 3))}' → '{data_txt}'")
        inicio = parse_data_evento(data_txt)
        if inicio is None:
            raise SystemExit(f"Data inválida no evento {original!r}: {g(r, 3)!r}")
        mcod = re.match(r"(Evento\s+[\w./]+)\s*-\s*(.+)", original)
        titulo = limpo(mcod.group(2)) if mcod else original
        forms_txt = limpo(g(r, 5))
        med = re.search(r"(\d+)\s*[ªº°]\s*Edi", forms_txt or "")
        obs = [f"Tipo na planilha: {limpo(g(r, 4))}"] if g(r, 4) else []
        if forms_txt:
            obs.append(f"Formulário: {forms_txt}")
        if g(r, 6):
            obs.append(limpo(g(r, 6)))
        status = "cancelado" if "cancelad" in nt(g(r, 6)) else "realizado"
        wd = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"][inicio.weekday()]
        mw = re.search(r"-\s*([^\-]+?)\s*-", data_txt or "")
        if mw and nt(mw.group(1)) != wd:
            rel["A conferir"].append(f"{original}: data {inicio:%d/%m/%Y} é {wd}, mas a planilha diz '{mw.group(1)}'")
        eventos.append(dict(id=k + 1, codigo_legado=original, edicao=(med.group(1) + "ª Edição") if med else None,
                            titulo=titulo, categoria=categoria(original), local=limpo(g(r, 1)), inicio=inicio,
                            horas=num(g(r, 2)), status=status, observacoes=" | ".join(obs) or None))
    n_ev = len(eventos)

    # ---------------- participantes da planilha (fundindo duplicados)
    participantes = {}      # pid -> dict
    linha_para_pid = {}     # índice da linha em Dados -> pid
    por_ra, por_email = {}, {}

    def novo_participante(nome, email, ra, origem_txt, **extra):
        chave = ra or email
        pid = str(uuid.uuid5(NS_UUID, chave))
        p = dict(id=pid, nome=nome, email=email, ra=ra, tipo="aluno_unicamp" if ra else "externo",
                 curso=None, ano_ingresso=None, celular=None, idade=None, genero=None, na_comunidade=None,
                 observacoes=None, origem=origem_txt)
        p.update({k: v for k, v in extra.items() if v is not None})
        participantes[pid] = p
        if ra:
            por_ra[ra] = pid
        por_email[email] = pid
        return pid

    for i, r in enumerate(dp):
        if not any(r):
            continue
        email = email_ok(g(r, 0))
        nome = limpo(g(r, 1))
        if not email or not nome:
            rel["Não importados"].append(f"Dados_Participantes linha {i + 2}: sem e-mail ou nome válido")
            continue
        ra = ra_valido(g(r, 2))
        bruto = ra_bruto_digitos(g(r, 2))
        obs = None
        if bruto and not ra:
            obs = f"RA inválido na planilha ({len(bruto)} dígitos) — conferir"
            rel["A conferir"].append(f"Dados_Participantes linha {i + 2} ({nome}): RA com {len(bruto)} dígitos; importado como 'externo' sem RA")
        elif not bruto:
            rel["Informativo"].append(f"Dados_Participantes linha {i + 2} ({nome}, @{email.split('@')[1]}): sem RA → 'externo'")
        dup = (ra and por_ra.get(ra)) or por_email.get(email)
        if dup:
            linha_para_pid[i] = dup
            rel["Duplicados fundidos"].append(f"Dados_Participantes linha {i + 2} ({nome}) fundida com cadastro anterior de mesmo RA/e-mail")
            continue
        if email.split("@")[1] in ("gnail.com", "gmial.com", "hotmial.com"):
            rel["A conferir"].append(f"Dados_Participantes linha {i + 2} ({nome}): domínio de e-mail suspeito '@{email.split('@')[1]}'")
        linha_para_pid[i] = novo_participante(
            nome, email, ra, "planilha",
            curso=curso_de(g(r, 4)), ano_ingresso=inteiro(g(r, 5), 1966, 2100), celular=limpo(g(r, 3)),
            idade=inteiro(g(r, 6), 10, 120), genero=genero(g(r, 7)), na_comunidade=sim_nao(g(r, 8)), observacoes=obs)

    # ---------------- matriz de presença -> inscrições
    insc = {}  # (pid, evento_id) -> dict
    for i, r in enumerate(ch_rows):
        pid = linha_para_pid.get(i)
        marc = [g(r, 6 + k) for k in range(n_ev)]
        if pid is None:
            if any(marc):
                rel["Não importados"].append(f"Controle de Horas linha {i + 4}: marcações sem participante correspondente")
            continue
        for k, v in enumerate(marc):
            if not v:
                continue
            st = STATUS_MATRIZ.get(str(v).strip().upper())
            if st is None:
                rel["A conferir"].append(f"Controle de Horas linha {i + 4}: valor desconhecido {v!r}")
                continue
            key = (pid, k + 1)
            if key not in insc or PRIORIDADE[st] > PRIORIDADE[insc[key]["status"]]:
                insc[key] = dict(status=st, origem="planilha_legado", respostas={}, criado_em=None)

    # ---------------- ajustes manuais escondidos nas fórmulas
    sheet_xml = zipfile.ZipFile(ctrl_path).read("xl/worksheets/sheet3.xml").decode()
    ajustes = []
    legado_horas = {}  # pid -> [acumuladas, validadas, pendentes]
    for i, r in enumerate(ch_rows):
        pid = linha_para_pid.get(i)
        if pid is None:
            continue
        acum = num(g(r, 2)) or 0
        valid = num(g(r, 5)) or 0
        pend = num(g(r, 3)) if nt(g(r, 4)) == "pendente" else 0
        if pid in legado_horas:   # duplicado fundido: a linha "boa" é a que tem horas
            old = legado_horas[pid]
            legado_horas[pid] = [max(old[0], acum), max(old[1], valid), max(old[2], pend or 0)]
        else:
            legado_horas[pid] = [acum, valid, pend or 0]
        m = re.search(r'<c r="C%d"[^>]*><f[^>]*>[^<]*?\)\)\)((?:\s*[+-]\s*\d+(?:\.\d+)?)+)</f>' % (i + 4), sheet_xml)
        if m:
            soma = sum(float(x.replace(" ", "")) for x in re.findall(r"[+-]\s*\d+(?:\.\d+)?", m.group(1)))
            ajustes.append(dict(pid=pid, horas=soma,
                                motivo=f"Ajuste manual na fórmula da planilha legada ({m.group(1).strip()}), linha {i + 4} — origem a confirmar"))
            rel["Ajustes manuais (origem a confirmar)"].append(
                f"{participantes[pid]['nome']}: {m.group(1).strip()} = {soma:+g} h (Controle de Horas linha {i + 4})")

    # ---------------- Forms -> inscrições + participantes que só aparecem nos Forms
    datas_ev = collections.defaultdict(list)
    for e in eventos:
        datas_ev[e["inicio"].date()].append(e)
    forms = sorted(glob.glob(os.path.join(base, "Forms Eventos *", "**", "*.xlsx"), recursive=True))
    n_forms_resp = 0
    for f in forms:
        nome_arq = os.path.basename(f)
        mano = re.search(r"[/\\](20\d\d)[/\\]", f)
        ano = int(mano.group(1)) if mano else None
        for aba, linhas in read_xlsx(f).items():
            if not linhas:
                continue
            hdr = [limpo(h) or "" for h in linhas[0]]
            hn = [nt(h) for h in hdr]
            if "formulario 2" in nt(aba):
                rel["Informativo"].append(f"{nome_arq} [{aba}]: aba de caronas ({len(linhas) - 1} respostas) não importada")
                continue
            info = next((h for h in hdr if "Data:" in h), "")
            mi = re.search(r"Data:\D*?(\d{2})/(\d{2})", info)
            mf = re.search(r"\((\d{2})_(\d{2})\)", nome_arq)
            dd = (mi or mf)
            evento = None
            if dd and ano:
                d = dt.date(ano, int(dd.group(2)), int(dd.group(1)))
                cands = datas_ev.get(d, [])
                if len(cands) > 1:
                    cat = categoria(nome_arq)
                    cands = [e for e in cands if e["categoria"] == cat] or cands
                if len(cands) == 1:
                    evento = cands[0]
                if mi and mf and (mi.group(1), mi.group(2)) != (mf.group(1), mf.group(2)):
                    rel["Informativo"].append(f"{nome_arq}: data do nome do arquivo difere da data no formulário; usada a do formulário ({mi.group(1)}/{mi.group(2)})")
            resp = [r for r in linhas[1:] if any(r)]
            if evento is None:
                rel["Não importados"].append(f"{nome_arq}: nenhum evento cadastrado na data do formulário — {len(resp)} inscrições NÃO importadas (cadastrar o evento e reimportar)")
                continue
            idx = lambda *nomes: next((i for i, h in enumerate(hn) if h in nomes), None)  # noqa: E731
            i_mail, i_nome = idx("endereco de e-mail"), idx("nome completo")
            i_ras = [i for i, h in enumerate(hn) if h in ("ra", "ra 2")]
            i_cel = idx("celular", "telefone")
            i_cur, i_ano, i_ida, i_sex = idx("curso"), idx("ano de ingresso"), idx("idade"), idx("sexo")
            i_com = next((i for i, h in enumerate(hn) if h.startswith("seja membro da comunidade")), None)
            i_ts = idx("carimbo de data/hora")
            outras = [i for i, h in enumerate(hn) if h and h not in CAMPOS_CADASTRO
                      and not h.startswith("seja membro da comunidade") and "data:" not in h]
            for r in resp:
                n_forms_resp += 1
                email = email_ok(g(r, i_mail))
                ra = next((x for x in (ra_valido(g(r, i)) for i in i_ras) if x), None)
                pid = (ra and por_ra.get(ra)) or (email and por_email.get(email))
                if pid is None:
                    nome = limpo(g(r, i_nome))
                    if not email or not nome:
                        rel["Não importados"].append(
                            f"{nome_arq}: linha sem e-mail válido (parece anotação manual na planilha de respostas: "
                            f"'{(limpo(g(r, i_mail)) or limpo(g(r, i_nome)) or '')[:60]}')")
                        continue
                    pid = novo_participante(
                        nome, email, ra, f"forms ({nome_arq})",
                        curso=curso_de(g(r, i_cur)) if i_cur is not None else None,
                        ano_ingresso=inteiro(g(r, i_ano), 1966, 2100) if i_ano is not None else None,
                        celular=limpo(g(r, i_cel)) if i_cel is not None else None,
                        idade=inteiro(g(r, i_ida), 10, 120) if i_ida is not None else None,
                        genero=genero(g(r, i_sex)) if i_sex is not None else None,
                        na_comunidade=sim_nao(g(r, i_com)) if i_com is not None else None)
                respostas = {hdr[i]: limpo(g(r, i)) for i in outras if limpo(g(r, i))}
                key = (pid, evento["id"])
                ts = serial_para_ts(g(r, i_ts)) if i_ts is not None else None
                if key in insc:
                    insc[key]["respostas"].update(respostas)
                    insc[key]["criado_em"] = insc[key]["criado_em"] or ts
                else:
                    insc[key] = dict(status="inscrito", origem="forms_legado", respostas=respostas, criado_em=ts)

    # ---------------- solicitações de validação (colunas D/E/F + Histórico)
    confirm = collections.defaultdict(list)
    for r in hist:
        if nt(g(r, 3)) == "solicitacao confirmada":
            confirm[ra_valido(g(r, 1))].append((serial_para_ts(g(r, 0)), num(g(r, 2))))
    agora = dt.datetime.now(BR).replace(microsecond=0)
    solicitacoes = []
    for pid, (acum, valid, pend) in legado_horas.items():
        ra = participantes[pid]["ra"]
        datas = sorted(confirm.get(ra, []), key=lambda x: x[0])
        if valid > 0:
            quando = datas[0][0] if datas else agora
            solicitacoes.append(dict(pid=pid, horas=valid, status="aprovada", solicitado_em=quando, decidido_em=quando,
                                     observacao="Importado da planilha legada (Horas Validadas - TOTAL)"))
        if pend and pend > 0:
            quando = datas[-1][0] if datas else agora
            solicitacoes.append(dict(pid=pid, horas=pend, status="pendente", solicitado_em=quando, decidido_em=None,
                                     observacao="Importado da planilha legada (Status: Pendente)"))
        if valid + (pend or 0) > acum + 1e-9:
            rel["A conferir"].append(f"{participantes[pid]['nome']}: validadas+pendentes ({valid}+{pend}) > acumuladas ({acum})")

    # ---------------- SQL
    cursos = sorted(set(p["curso"] for p in participantes.values() if p["curso"]))
    curso_id = {c: i + 1 for i, c in enumerate(cursos)}
    cats = sorted(set(e["categoria"] for e in eventos))
    cat_id = {c: i + 1 for i, c in enumerate(cats)}
    L = ["-- GERADO por scripts/migracao/importar.py em " + agora.isoformat(),
         "-- CONTÉM DADOS PESSOAIS. Não versionar, não compartilhar.",
         "begin;", "set local search_path = public, extensions;", ""]

    def bloco(tabela, cols, linhas, overriding=False):
        if not linhas:
            return
        L.append(f"insert into public.{tabela} ({', '.join(cols)})" + (" overriding system value" if overriding else "") + " values")
        L.append(",\n".join("  (" + ", ".join(v) + ")" for v in linhas) + ";")
        L.append("")

    bloco("cursos", ["id", "nome"], [[str(curso_id[c]), q(c)] for c in cursos], True)
    bloco("categorias_evento", ["id", "nome"], [[str(cat_id[c]), q(c)] for c in cats], True)
    bloco("eventos", ["id", "codigo_legado", "edicao", "titulo", "categoria_id", "local", "inicio", "horas", "status", "observacoes"],
          [[str(e["id"]), q(e["codigo_legado"]), q(e["edicao"]), q(e["titulo"]), str(cat_id[e["categoria"]]), q(e["local"]),
            q(e["inicio"]), q(e["horas"]), q(e["status"]), q(e["observacoes"])] for e in eventos], True)
    bloco("participantes", ["id", "nome", "email", "ra", "tipo", "curso_id", "ano_ingresso", "celular", "idade", "genero",
                            "na_comunidade", "observacoes"],
          [[q(p["id"]), q(p["nome"]), q(p["email"]), q(p["ra"]), q(p["tipo"]), q(curso_id.get(p["curso"])), q(p["ano_ingresso"]),
            q(p["celular"]), q(p["idade"]), q(p["genero"]), q(p["na_comunidade"]), q(p["observacoes"])]
           for p in participantes.values()])
    bloco("inscricoes", ["participante_id", "evento_id", "status", "origem", "respostas", "criado_em"],
          [[q(pid), str(eid), q(v["status"]), q(v["origem"]), qj(v["respostas"]), q(v["criado_em"]) if v["criado_em"] else "now()"]
           for (pid, eid), v in insc.items()])
    bloco("ajustes_horas", ["participante_id", "horas", "motivo"], [[q(a["pid"]), q(a["horas"]), q(a["motivo"])] for a in ajustes])
    bloco("solicitacoes_validacao", ["participante_id", "horas", "status", "solicitado_em", "decidido_em", "observacao"],
          [[q(s["pid"]), q(s["horas"]), q(s["status"]), q(s["solicitado_em"]), q(s["decidido_em"]), q(s["observacao"])]
           for s in solicitacoes])
    for t in ("cursos", "categorias_evento", "eventos"):
        L.append(f"select setval(pg_get_serial_sequence('public.{t}', 'id'), (select max(id) from public.{t}));")
    L.append("")
    L.append("-- Conferência: horas do banco novo == horas da planilha (senão desfaz tudo)")
    L.append("create temp table _legado (participante_id uuid, acumuladas numeric, validadas numeric, pendentes numeric) on commit drop;")
    bloco_leg = [[q(pid), q(a), q(v), q(p)] for pid, (a, v, p) in legado_horas.items()]
    L.append("insert into _legado values\n" + ",\n".join("  (" + ", ".join(x) + ")" for x in bloco_leg) + ";")
    L.append("""do $$
declare n int; ex text;
begin
  select count(*), string_agg(p.nome || ': ' || s.horas_acumuladas || '/' || l.acumuladas, '; ')
    into n, ex
  from _legado l
  join public.saldo_horas s using (participante_id)
  join public.participantes p on p.id = l.participante_id
  where s.horas_acumuladas <> l.acumuladas or s.horas_validadas <> l.validadas or s.horas_pendentes <> l.pendentes;
  if n > 0 then
    raise exception 'Conferência falhou para % participante(s): %', n, left(ex, 500);
  end if;
  raise notice 'Conferência OK: % participantes com horas idênticas à planilha', (select count(*) from _legado);
end $$;""")
    L.append("commit;")

    saida = os.path.join(base, "saida")
    os.makedirs(saida, exist_ok=True)
    with open(os.path.join(saida, "importacao.sql"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")

    # ---------------- relatório
    st_count = collections.Counter(v["status"] for v in insc.values())
    org_count = collections.Counter(p["origem"].split(" ")[0] for p in participantes.values())
    R = ["# Relatório de importação — planilha legada → banco novo", "",
         f"Gerado em {agora:%d/%m/%Y %H:%M}. **Contém dados pessoais — uso interno da organização.**", "",
         "## Totais", "",
         f"- Eventos: {len(eventos)} ({sum(e['status'] == 'cancelado' for e in eventos)} cancelado)",
         f"- Participantes: {len(participantes)} (planilha: {org_count['planilha']}, só nos Forms: {org_count['forms']})",
         f"  - alunos Unicamp: {sum(p['tipo'] == 'aluno_unicamp' for p in participantes.values())}, externos: {sum(p['tipo'] == 'externo' for p in participantes.values())}",
         f"- Inscrições: {len(insc)} — " + ", ".join(f"{k}: {v}" for k, v in st_count.most_common()),
         f"- Respostas de Forms lidas: {n_forms_resp} (RG/CPF descartados)",
         f"- Ajustes manuais: {len(ajustes)} ({sum(a['horas'] for a in ajustes):+g} h)",
         f"- Solicitações: {sum(s['status'] == 'aprovada' for s in solicitacoes)} aprovadas ({sum(s['horas'] for s in solicitacoes if s['status'] == 'aprovada'):g} h), "
         f"{sum(s['status'] == 'pendente' for s in solicitacoes)} pendentes",
         f"- Horas acumuladas (total): {sum(v[0] for v in legado_horas.values()):g} h",
         f"- Cursos: {len(cursos)} após unificar grafias",
         f"- Histórico de tokens (aba Historico): {len(hist)} registros — não importados (log do sistema antigo)", ""]
    ordem = ["Não importados", "Ajustes manuais (origem a confirmar)", "A conferir", "Correções aplicadas",
             "Duplicados fundidos", "Informativo"]
    for sec in ordem:
        if rel.get(sec):
            R += [f"## {sec}", ""] + [f"- {x}" for x in rel[sec]] + [""]
    R += ["## Cursos unificados", ""] + [f"- {c}" for c in cursos] + [""]
    with open(os.path.join(saida, "relatorio_importacao.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(R) + "\n")

    print("\n".join(R[:16]))
    print("Seções do relatório:", {s: len(rel[s]) for s in ordem if rel.get(s)})
    print("Arquivos em:", saida)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
