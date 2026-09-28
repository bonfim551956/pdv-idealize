import { Component } from 'react'

// Mostra o erro na tela em vez de deixar a página em branco
export default class ErrorBoundary extends Component {
  state = { erro: null }
  static getDerivedStateFromError(erro) { return { erro } }
  componentDidCatch(erro, info) { console.error(erro, info) }
  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-bold">O PDV encontrou um erro</h1>
        <p className="text-sm text-muted">Recarregue a página. Se continuar, envie esta mensagem para o suporte:</p>
        <pre className="overflow-x-auto rounded-md bg-danger-soft p-4 text-xs text-danger">{String(this.state.erro?.message || this.state.erro)}</pre>
        <button onClick={() => location.reload()} className="h-12 rounded-md bg-brand px-4 font-semibold text-surface">Recarregar</button>
      </div>
    )
  }
}
