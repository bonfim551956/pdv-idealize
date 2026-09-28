/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    fontFamily: {
      sans: ['"Public Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
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
        ink: '#17232D',       // texto principal
        muted: '#52626E',     // texto secundário (7:1 sobre bg)
        bg: '#F3F6F7',        // fundo da aplicação
        surface: '#FAFAFA',   // painéis
        line: '#D4DDE2',      // bordas
        brand: { DEFAULT: '#0D5C75', dark: '#094358', soft: '#E3EEF2' }, // azul-petróleo
        od: { DEFAULT: '#0D5C75', soft: '#E3EEF2' },  // olho direito
        oe: { DEFAULT: '#8A4B1F', soft: '#F6ECE3' },  // olho esquerdo
        ok: { DEFAULT: '#1E7A46', soft: '#E4F2EA' },
        danger: { DEFAULT: '#B42318', soft: '#FBE9E7' },
        warn: { DEFAULT: '#8A5A00', soft: '#FFF4D6' },
      },
      borderRadius: { md: '8px', lg: '12px' },
    },
  },
  plugins: [],
}
