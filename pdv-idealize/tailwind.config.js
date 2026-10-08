/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    fontFamily: {
      sans: ['"Public Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      display: ['Montserrat', '"Public Sans"', 'system-ui', 'sans-serif'], // mesma família geométrica da logo
    },
    // escala 12/14/16/20/24/32/48 — títulos 1.2, corpo 1.5
    fontSize: {
      xs: ['12px', '1.5'],
      sm: ['14px', '1.5'],
      base: ['16px', '1.5'],
      lg: ['20px', '1.2'],
      xl: ['24px', '1.2'],
      '2xl': ['32px', '1.2'],
      '3xl': ['48px', '1.2'],
    },
    extend: {
      colors: {
        ink: '#16272B',        // texto principal (teal quase preto)
        muted: '#4E6468',      // texto secundário
        bg: '#F2F6F6',         // fundo da aplicação
        surface: '#FAFAFA',    // painéis
        line: '#D2DEDF',       // bordas
        // Teal da marca: #1DA3A6 é a cor da logo (decorativa); a versão escura garante contraste AA em texto e botões
        brand: { DEFAULT: '#0B6E71', dark: '#085659', bright: '#1DA3A6', soft: '#E1F2F2', deep: '#0A3F42' },
        // Laranja da marca: só como acento (faixas, destaques, fundo escuro) — não como texto sobre claro
        accent: { DEFAULT: '#FC9E3C', dark: '#A3560F', soft: '#FEF1E2' },
        od: { DEFAULT: '#0B6E71', soft: '#E1F2F2' },   // olho direito = teal
        oe: { DEFAULT: '#A3560F', soft: '#FEF1E2' },   // olho esquerdo = laranja
        ok: { DEFAULT: '#1E7A46', soft: '#E4F2EA' },
        danger: { DEFAULT: '#B42318', soft: '#FBE9E7' },
        warn: { DEFAULT: '#8A5A00', soft: '#FFF4D6' },
      },
      borderRadius: { md: '8px', lg: '12px' },
    },
  },
  plugins: [],
}
