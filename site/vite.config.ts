import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages publica em /<nome-do-repositório>/. VITE_BASE permite trocar
// (ex.: "/" num domínio próprio).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/Site-oficial_Mutiroes-UNICAMP/',
  plugins: [react(), tailwindcss()],
})
