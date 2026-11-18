type Celula = string | number | boolean | null | undefined

/** Baixa um CSV que abre direto no Excel/Sheets em português (";" e BOM UTF-8). */
export function baixarCsv(nomeArquivo: string, cabecalho: string[], linhas: Celula[][]) {
  const esc = (v: Celula) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : typeof v === 'number' ? String(v).replace('.', ',') : v
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const texto = [cabecalho, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nomeArquivo.endsWith('.csv') ? nomeArquivo : `${nomeArquivo}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
