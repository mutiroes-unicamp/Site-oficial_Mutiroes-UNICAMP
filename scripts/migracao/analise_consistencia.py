"""Consistency analysis of the Mutirões control workbook + forms. Prints aggregates only."""
import sys, os, re, zipfile, collections, glob, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
from xlsx import read_xlsx

BASE = sys.argv[1]
CTRL = os.path.join(BASE, "Controle de Presença - Mutirões.xlsx")
wb = read_xlsx(CTRL)
dp, ev, ch, hist = wb["Dados_Participantes"], wb["Eventos"], wb["Controle de Horas"], wb["Historico"]


def g(r, i):
    return r[i] if len(r) > i else None


def norm_ra(v):
    if v is None:
        return None
    s = re.sub(r"\.0$", "", str(v).strip())
    s = re.sub(r"\D", "", s)
    return s or None


def norm_txt(v):
    if v is None:
        return ""
    s = unicodedata.normalize("NFKD", str(v)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def num(v):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None

out = []
P = lambda *a: out.append(" ".join(str(x) for x in a))

# ---------- formulas: row/col alignment ----------
z = zipfile.ZipFile(CTRL)
x = z.read("xl/worksheets/sheet3.xml").decode()
fa = re.findall(r'<c r="A(\d+)"[^>]*><f[^>]*>Dados_Participantes!B(\d+)', x)
off = collections.Counter(int(a) - int(b) for a, b in fa)
P("[ALINHAMENTO] Controle!A{n} = Dados!B{n-k}: offsets", dict(off), "em", len(fa), "linhas")
fc = re.findall(r'<c r="C(\d+)"[^>]*><f[^>]*>', x)
P("[ALINHAMENTO] linhas com fórmula de Horas Acumuladas:", len(fc), "de", len(ch) - 3)
rng = re.findall(r'<c r="([A-Z]+)3"[^>]*><f[^>]*>SUMPRODUCT\(--\(\w+4:\w+?(\d+)=', x)
P("[CONTAGEM] fim do intervalo de 'Participantes por evento':", collections.Counter(e for _, e in rng))

# ---------- Eventos ----------
evrows = [r for r in ev[1:] if g(r, 0)]
P("\n[EVENTOS] eventos cadastrados:", len(evrows))
hdr = ch[0]
evcols = list(range(6, len(hdr)))
mism = []
for k, ci in enumerate(evcols):
    h = hdr[ci]
    e = evrows[k] if k < len(evrows) else None
    if h and str(h).startswith("Column"):
        continue
    if e is None or norm_txt(h) != norm_txt(e[0]):
        mism.append((k + 2, h, e[0] if e else None))
P("[EVENTOS] cabeçalho da coluna difere do nome na linha correspondente de Eventos:", len(mism))
for m in mism:
    P("    Eventos linha", m[0], "| coluna:", repr(m[1]), "| Eventos:", repr(m[2]))
names = collections.Counter(re.sub(r"^evento [\d./]+\s*-\s*", "", norm_txt(r[0])) for r in evrows)
P("[EVENTOS] nomes repetidos (sem o número):", [n for n, c in names.items() if c > 1])
tipos = collections.Counter(norm_txt(g(r, 4)) for r in evrows)
P("[EVENTOS] 'Tipo' repetido:", [n for n, c in tipos.items() if c > 1])
nums = [re.match(r"evento ([\d./]+)", norm_txt(r[0])) for r in evrows]
P("[EVENTOS] sem número 'Evento N':", [r[0] for r, m in zip(evrows, nums) if not m])
P("[EVENTOS] numeração não inteira:", [m.group(1) for m in nums if m and not m.group(1).isdigit()])
import datetime
WD = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]
bad_wd, dates = [], []
for r in evrows:
    m = re.match(r"(\d{2})/(\d{2})/(\d{2,4})\s*-\s*(\w+)", norm_txt(g(r, 3)))
    if not m:
        P("[EVENTOS] data fora do padrão:", r[0], repr(g(r, 3))); continue
    y = int(m.group(3)); y = y + 2000 if y < 100 else y
    d = datetime.date(y, int(m.group(2)), int(m.group(1)))
    dates.append(d)
    if WD[d.weekday()] != m.group(4):
        bad_wd.append((r[0].strip(), str(d), m.group(4), WD[d.weekday()]))
P("[EVENTOS] dia da semana não bate com a data:", bad_wd)
P("[EVENTOS] fora de ordem cronológica:", sum(1 for a, b in zip(dates, dates[1:]) if b < a))
P("[EVENTOS] observações extras (col G):", [(r[0].strip(), g(r, 6)) for r in evrows if g(r, 6)])
P("[EVENTOS] formatos do ano: 2 dígitos", sum(bool(re.match(r"\d\d/\d\d/\d\d\b", str(g(r,3)).strip())) for r in evrows),
  "| 4 dígitos", sum(bool(re.match(r"\d\d/\d\d/\d{4}", str(g(r,3)).strip())) for r in evrows))
evh = [num(g(r, 2)) for r in evrows]

# ---------- Participantes ----------
people = dp[1:]
P("\n[PARTICIPANTES] linhas:", len(people), "| vazias:", sum(1 for r in people if not any(r)))
ras = [norm_ra(g(r, 2)) for r in people]
P("[PARTICIPANTES] sem RA:", sum(1 for r in ras if not r))
P("[PARTICIPANTES] tamanhos de RA:", collections.Counter(len(r) for r in ras if r))
P("[PARTICIPANTES] RA com caracteres extras (antes de normalizar):",
  sum(1 for r in people if g(r, 2) and not re.fullmatch(r"\d+(\.0)?", str(g(r, 2)).strip())))
dup = [ra for ra, c in collections.Counter(r for r in ras if r).items() if c > 1]
P("[PARTICIPANTES] RAs duplicados:", len(dup), "->", sum(collections.Counter(r for r in ras if r)[d] for d in dup), "linhas")
em = [norm_txt(g(r, 0)) for r in people]
dupe = [e for e, c in collections.Counter(e for e in em if e).items() if c > 1]
P("[PARTICIPANTES] e-mails duplicados:", len(dupe), "| sem e-mail:", sum(1 for e in em if not e))
P("[PARTICIPANTES] e-mail com maiúsculas/espaços:", sum(1 for r in people if g(r, 0) and str(g(r, 0)) != str(g(r, 0)).strip().lower()))
P("[PARTICIPANTES] e-mail inválido:", sum(1 for e in em if e and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", e)))
P("[PARTICIPANTES] domínios:", collections.Counter(e.split("@")[-1] for e in em if "@" in e).most_common(6))
P("[PARTICIPANTES] nomes com espaço/quebra de linha sobrando:", sum(1 for r in people if g(r, 1) and str(g(r, 1)) != str(g(r, 1)).strip()))
cursos = collections.Counter(g(r, 4) for r in people if g(r, 4))
cn = collections.defaultdict(set)
for c in cursos:
    cn[norm_txt(c)].add(c)
P("[PARTICIPANTES] cursos distintos:", len(cursos), "-> após normalizar:", len(cn), "| variações:", [sorted(v) for v in cn.values() if len(v) > 1])
P("[PARTICIPANTES] colunas 'Coluna 1..8' preenchidas:", sum(1 for r in people for v in r[9:] if v))

# ---------- Controle ----------
rows = ch[3:]
P("\n[CONTROLE] linhas de aluno:", len(rows))
cra = [norm_ra(g(r, 1)) for r in rows]
P("[CONTROLE] RA de cada linha == RA da linha correspondente em Dados:",
  sum(1 for a, b in zip(cra, ras) if a == b), "de", min(len(cra), len(ras)))
vals = collections.Counter()
mismatch, ok, notnum = [], 0, 0
over = 0
for i, r in enumerate(rows):
    calc = 0
    for k, ci in enumerate(evcols[: len(evrows)]):
        v = g(r, ci)
        vals[v] += 1
        if v and str(v).strip().upper() == "PARTICIPOU":
            calc += evh[k] or 0
    stored = num(g(r, 2))
    if stored is None:
        notnum += 1
    elif abs(stored - calc) > 1e-6:
        mismatch.append((i + 4, stored, calc))
    else:
        ok += 1
    val = num(g(r, 5))
    if val is not None and stored is not None and val > stored:
        over += 1
P("[CONTROLE] Horas Acumuladas == soma recalculada:", ok, "| divergentes:", len(mismatch), "| não numéricas:", notnum)
for m in mismatch[:10]:
    P("    linha", m[0], "armazenado", m[1], "recalculado", m[2])
P("[CONTROLE] valores de presença:", dict(vals))
P("[CONTROLE] validadas > acumuladas:", over)
tot = [num(g(r, 2)) or 0 for r in rows]
P("[CONTROLE] alunos com >0h:", sum(1 for t in tot if t > 0), "| total de horas:", sum(tot),
  "| validadas (soma):", sum(num(g(r, 5)) or 0 for r in rows))
part = sum(1 for r in rows for ci in evcols if str(g(r, ci) or "").strip().upper() == "PARTICIPOU")
P("[CONTROLE] presenças 'Participou':", part)
# events with zero / counts row
cnt_row = ch[2]
bad_cnt = []
for k, ci in enumerate(evcols[: len(evrows)]):
    real = sum(1 for r in rows if str(g(r, ci) or "").strip().upper() == "PARTICIPOU")
    st = num(g(cnt_row, ci))
    if st is not None and int(st) != real:
        bad_cnt.append((hdr[ci].strip(), int(st), real))
P("[CONTAGEM] 'Participantes por evento' diferente do real:", bad_cnt)
P("[CONTROLE] eventos sem nenhuma presença marcada:",
  [hdr[ci].strip() for ci in evcols[: len(evrows)] if not any(g(r, ci) for r in rows)])

# ---------- Histórico ----------
hr = [r for r in hist[1:] if any(r)]
P("\n[HISTÓRICO] registros:", len(hr), "| vazios:", len(hist) - 1 - len(hr))
hra = set(norm_ra(g(r, 1)) for r in hr)
P("[HISTÓRICO] RAs que não existem em Dados:", len(hra - set(ras)))

# ---------- Forms ----------
P("\n[FORMS]")
allforms = sorted(glob.glob(os.path.join(BASE, "Forms Eventos ", "**", "*.xlsx"), recursive=True))
ra_set = set(r for r in ras if r)
evdates = {}
for k, r in enumerate(evrows):
    m = re.match(r"(\d{2})/(\d{2})/(\d{2,4})", str(g(r, 3)).strip())
    if m:
        evdates.setdefault((m.group(1), m.group(2)), []).append(k)
totresp = 0
sens = collections.Counter()
for f in allforms:
    fw = read_xlsx(f)
    name = os.path.basename(f)
    for sh, fr in fw.items():
        if not fr:
            continue
        h = [norm_txt(c) for c in fr[0]]
        for c in h:
            if c in ("rg", "cpf"):
                sens[c] += 1
        rai = [i for i, c in enumerate(h) if c in ("ra", "ra 2")]
        emi = h.index("endereco de e-mail") if "endereco de e-mail" in h else None
        resp = [r for r in fr[1:] if any(r)]
        if "formulario 2" in norm_txt(sh):
            P("  ", name[:60], f"[{sh}] (carona) respostas:", len(resp)); continue
        totresp += len(resp)
        fem = [norm_txt(g(r, emi)) if emi is not None else None for r in resp]
        fra = []
        for r in resp:
            cand = [norm_ra(g(r, i)) for i in rai]
            cand = [c for c in cand if c and len(c) in (5, 6)]
            fra.append(cand[0] if cand else None)
        noRA = sum(1 for a, e in zip(fra, fem) if not a)
        noBoth = sum(1 for a, e in zip(fra, fem) if not a and not (e and e in em))
        unknown = sum(1 for a in fra if a and a not in ra_set)
        dupr = sum(c - 1 for c in collections.Counter(a for a in fra if a).values() if c > 1)
        # match event
        m = re.search(r"\((\d{2})_(\d{2})\)", name)
        dm = None
        info = next((c for c in fr[0] if c and "Data:" in str(c)), "")
        mi = re.search(r"Data:\s*\w*\W*\(?(\d{2})/(\d{2})", str(info))
        dt_file = (m.group(1), m.group(2)) if m else None
        dt_info = (mi.group(1), mi.group(2)) if mi else None
        key = dt_info or dt_file
        cands = evdates.get(key, []) if key else []
        if len(cands) > 1:
            nl = norm_txt(name)
            kw = ("gatos" if "gatos" in nl else "agro" if "agro" in nl else "pets" if ("pets" in nl or "adocao" in nl) else "coleta" if "coleta" in nl else "")
            cands = [c for c in cands if kw in norm_txt(evrows[c][0])] or cands
        evk = cands[0] if len(cands) == 1 else None
        line = f"   {name[:62]:62} resp={len(resp):3} semRA={noRA:2} semRA_nem_email_no_cadastro={noBoth:2} RAdesconhecido={unknown:2} dupl={dupr}"
        if dt_file and dt_info and dt_file != dt_info:
            line += f" | DATA arquivo {dt_file} ≠ form {dt_info}"
        if evk is None:
            line += f" | evento não identificado (data {key}; candidatos em Eventos: {[evrows[c][0].strip() for c in evdates.get(key, [])]})"
        else:
            ci = evcols[evk]
            st = collections.Counter()
            idx_by = []
            for a, e in zip(fra, fem):
                j = ras.index(a) if a and a in ra_set else (em.index(e) if e and e in em else None)
                idx_by.append(j)
                if j is None or j >= len(rows):
                    st["fora do controle"] += 1; continue
                row = rows[j]
                st[str(g(row, ci) or "vazio").strip()] += 1
            inscritos = set(j for j in idx_by if j is not None)
            pres_sem_insc = sum(1 for j, r in enumerate(rows)
                                if str(g(r, ci) or "").strip().upper() == "PARTICIPOU" and j not in inscritos)
            line += f" -> {evrows[evk][0].strip()[:28]} | status inscritos: {dict(st)} | presentes sem inscrição: {pres_sem_insc}"
        P(line)
P("[FORMS] total de respostas (inscrições):", totresp)
P("[FORMS] formulários que coletam RG/CPF:", dict(sens))
print("\n".join(out))
