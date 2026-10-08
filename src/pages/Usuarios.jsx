import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserPlus, KeyRound, Pencil, Power, Search, ShieldCheck } from 'lucide-react'
import { supabase, mensagemErro } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PERFIS, perfisGerenciaveis } from '../lib/permissoes'
import { Button, Field, Input, Select, Modal, Alert, Spinner, Section, Chips, cx, useToast } from '../components/ui'

const nomeLoja = (n) => (n || '').replace('Óticas Idealize ', '')
const COR_PERFIL = {
  comercial: 'bg-brand-soft text-brand',
  administrativo: 'bg-accent-soft text-accent-dark',
  supervisao: 'bg-ok-soft text-ok',
  diretor: 'bg-ink text-surface',
}

async function chamar(body) {
  const { data, error } = await supabase.functions.invoke('gerir-usuario', { body })
  if (error) {
    // a função devolve { erro } com status 4xx; o supabase-js embrulha no contexto
    let msg = error.message
    try { const j = await error.context?.json?.(); if (j?.erro) msg = j.erro } catch { /* mantém msg */ }
    throw new Error(msg)
  }
  if (data?.erro) throw new Error(data.erro)
  return data
}

function PerfilBadge({ cargo }) {
  return <span className={cx('inline-flex rounded px-2 py-0.5 text-xs font-semibold', COR_PERFIL[cargo])}>{PERFIS[cargo]?.nome}</span>
}

function FormUsuario({ inicial, lojas, perfisPermitidos, onSalvo, onCancelar }) {
  const toast = useToast()
  const editando = !!inicial?.id
  const [f, setF] = useState({
    nome: inicial?.nome || '', usuario: inicial?.usuario || '', senha: '', confirma: '',
    cargo: inicial?.cargo || perfisPermitidos[0] || 'comercial', loja_id: inicial?.loja_id || lojas[0]?.id || '',
  })
  const [erros, setErros] = useState({})
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const salvar = async (e) => {
    e.preventDefault()
    const er = {}
    if (f.nome.trim().split(/\s+/).length < 2) er.nome = 'Informe nome e sobrenome'
    if (!editando) {
      if (!/^[a-z0-9._]{3,30}$/.test(f.usuario)) er.usuario = '3 a 30 caracteres: letras minúsculas, números, ponto ou _'
      if (f.senha.length < 6) er.senha = 'Mínimo de 6 caracteres'
      else if (f.senha !== f.confirma) er.confirma = 'As senhas não conferem'
    }
    if (!f.loja_id) er.loja_id = 'Escolha a loja'
    setErros(er)
    if (Object.keys(er).length) return
    setSalvando(true); setErro(null)
    try {
      if (editando) await chamar({ acao: 'editar', id: inicial.id, nome: f.nome, cargo: f.cargo, loja_id: f.loja_id })
      else await chamar({ acao: 'criar', nome: f.nome, usuario: f.usuario, senha: f.senha, cargo: f.cargo, loja_id: f.loja_id })
      toast(editando ? 'Usuário atualizado' : `Usuário ${f.usuario} criado`)
      onSalvo()
    } catch (err) { setErro(mensagemErro(err)) }
    setSalvando(false)
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
      {erro && <Alert>{erro}</Alert>}
      <Field label="Nome completo" required error={erros.nome}>
        {({ id, invalid }) => <Input id={id} invalid={invalid} value={f.nome} onChange={set('nome')} autoFocus />}
      </Field>
      {!editando && (
        <>
          <Field label="Usuário de login" required error={erros.usuario} hint="É o que a pessoa digita para entrar. Ex.: mariana.rosa">
            {({ id, invalid }) => <Input id={id} invalid={invalid} autoCapitalize="none" autoComplete="off" value={f.usuario}
              onChange={(e) => setF((x) => ({ ...x, usuario: e.target.value.toLowerCase().replace(/\s/g, '.') }))} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Senha inicial" required error={erros.senha}>
              {({ id, invalid }) => <Input id={id} invalid={invalid} type="password" autoComplete="new-password" value={f.senha} onChange={set('senha')} />}
            </Field>
            <Field label="Repita a senha" required error={erros.confirma}>
              {({ id, invalid }) => <Input id={id} invalid={invalid} type="password" autoComplete="new-password" value={f.confirma} onChange={set('confirma')} />}
            </Field>
          </div>
        </>
      )}
      <Field label="Loja" required error={erros.loja_id}>
        {({ id, invalid }) => (
          <Select id={id} invalid={invalid} value={f.loja_id} onChange={set('loja_id')}>
            {lojas.map((l) => <option key={l.id} value={l.id}>{nomeLoja(l.nome)}</option>)}
          </Select>
        )}
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Perfil de acesso <span className="text-danger">*</span></span>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Perfil de acesso">
          {perfisPermitidos.map((k) => (
            <label key={k} className={cx('flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
              f.cargo === k ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand')}>
              <input type="radio" name="cargo" value={k} checked={f.cargo === k} onChange={set('cargo')} className="mt-1 h-4 w-4 accent-[#0B6E71]" />
              <span>
                <span className="block font-semibold">{PERFIS[k].nome}</span>
                <span className="block text-sm text-muted">{PERFIS[k].descricao}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button type="submit" loading={salvando}>{editando ? 'Salvar alterações' : 'Criar usuário'}</Button>
      </div>
    </form>
  )
}

function FormSenha({ usuario, onSalvo, onCancelar }) {
  const toast = useToast()
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const salvar = async (e) => {
    e.preventDefault()
    if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== confirma) { setErro('As senhas não conferem.'); return }
    setSalvando(true); setErro(null)
    try { await chamar({ acao: 'senha', id: usuario.id, senha }); toast(`Senha de ${usuario.usuario} redefinida`); onSalvo() }
    catch (err) { setErro(mensagemErro(err)) }
    setSalvando(false)
  }
  return (
    <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted">Defina uma nova senha para <b className="text-ink">{usuario.nome}</b> (usuário <b className="text-ink">{usuario.usuario}</b>) e informe a ela pessoalmente.</p>
      {erro && <Alert>{erro}</Alert>}
      <Field label="Nova senha" required>{({ id }) => <Input id={id} type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />}</Field>
      <Field label="Repita a nova senha" required>{({ id }) => <Input id={id} type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />}</Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button type="submit" loading={salvando}>Redefinir senha</Button>
      </div>
    </form>
  )
}

export default function Usuarios() {
  const { perfil, perm } = useAuth()
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [lojas, setLojas] = useState([])
  const [erro, setErro] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtroLoja, setFiltroLoja] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('ativos')
  const [modal, setModal] = useState(null) // { tipo: 'novo'|'editar'|'senha'|'status', usuario }
  const [processando, setProcessando] = useState(false)

  const permitidos = perfisGerenciaveis(perm.nivel)
  const podeGerir = (u) => permitidos.includes(u.cargo)

  const carregar = useCallback(async () => {
    const [c, l] = await Promise.all([
      supabase.from('colaboradores').select('id, nome, usuario, cargo, ativo, loja_id, auth_user_id, loja:lojas(nome)').order('nome'),
      supabase.from('lojas').select('id, nome').eq('ativo', true).order('nome'),
    ])
    if (c.error || l.error) { setErro(mensagemErro(c.error || l.error)); setLista([]); return }
    setLista(c.data); setLojas(l.data)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const filtrada = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return (lista || []).filter((u) =>
      (!b || u.nome.toLowerCase().includes(b) || (u.usuario || '').includes(b)) &&
      (!filtroLoja || u.loja_id === filtroLoja) &&
      (filtroStatus === 'todos' || (filtroStatus === 'ativos' ? u.ativo : !u.ativo)))
  }, [lista, busca, filtroLoja, filtroStatus])

  const alternarStatus = async () => {
    const u = modal.usuario
    setProcessando(true)
    try {
      await chamar({ acao: u.ativo ? 'desativar' : 'ativar', id: u.id })
      toast(u.ativo ? `${u.nome} desativado` : `${u.nome} reativado`)
      setModal(null); carregar()
    } catch (err) { toast(mensagemErro(err), 'erro') }
    setProcessando(false)
  }

  const fechar = () => setModal(null)
  const salvo = () => { setModal(null); carregar() }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Usuários</h1>
          <p className="mt-1 text-sm text-muted">Cada consultor entra com o próprio usuário, e a loja da venda vem do cadastro dele.</p>
        </div>
        <Button icon={UserPlus} onClick={() => setModal({ tipo: 'novo' })}>Novo usuário</Button>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Buscar usuário" className="pl-9" placeholder="Buscar por nome ou usuário" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Select aria-label="Loja" className="w-56" value={filtroLoja} onChange={(e) => setFiltroLoja(e.target.value)}>
            <option value="">Todas as lojas</option>
            {lojas.map((l) => <option key={l.id} value={l.id}>{nomeLoja(l.nome)}</option>)}
          </Select>
          <Chips label="Situação" value={filtroStatus} onChange={(v) => v && setFiltroStatus(v)}
            options={[{ value: 'ativos', label: 'Ativos' }, { value: 'inativos', label: 'Desativados' }, { value: 'todos', label: 'Todos' }]} />
        </div>
      </div>

      {erro && <Alert>{erro}</Alert>}
      {lista === null ? <Spinner label="Carregando usuários" /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Usuário</th>
                <th className="px-4 py-3 font-medium">Perfil</th>
                <th className="px-4 py-3 font-medium">Loja</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrada.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhum usuário encontrado.</td></tr>
              )}
              {filtrada.map((u) => {
                const gerivel = podeGerir(u) && u.id !== perfil.id
                return (
                  <tr key={u.id} className={cx('border-b border-line last:border-0', !u.ativo && 'opacity-60')}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{u.nome}{u.id === perfil.id && <span className="text-muted"> (você)</span>}</p>
                      {!u.ativo && <p className="text-xs font-semibold text-danger">Desativado</p>}
                      {u.ativo && !u.auth_user_id && <p className="text-xs text-warn">Sem login vinculado</p>}
                    </td>
                    <td className="num px-4 py-3">{u.usuario || '—'}</td>
                    <td className="px-4 py-3"><PerfilBadge cargo={u.cargo} /></td>
                    <td className="px-4 py-3">{nomeLoja(u.loja?.nome)}</td>
                    <td className="px-4 py-3">
                      {podeGerir(u) ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setModal({ tipo: 'editar', usuario: u })} aria-label={`Editar ${u.nome}`}>Editar</Button>
                          <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => setModal({ tipo: 'senha', usuario: u })} aria-label={`Redefinir senha de ${u.nome}`}>Senha</Button>
                          {gerivel && (
                            <Button variant="ghost" size="sm" icon={Power} onClick={() => setModal({ tipo: 'status', usuario: u })}
                              className={u.ativo ? 'hover:text-danger' : 'hover:text-ok'}>{u.ativo ? 'Desativar' : 'Reativar'}</Button>
                          )}
                        </div>
                      ) : <p className="text-right text-xs text-muted">Perfil acima do seu</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Section title="O que cada perfil pode fazer" aside={<ShieldCheck className="h-5 w-5 text-brand" aria-hidden />}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {Object.entries(PERFIS).map(([k, p]) => (
            <li key={k} className="flex flex-col gap-1 rounded-md border border-line p-3">
              <PerfilBadge cargo={k} />
              <p className="text-sm text-muted">{p.descricao}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Modal open={modal?.tipo === 'novo' || modal?.tipo === 'editar'} onOpenChange={(v) => !v && fechar()} title={modal?.tipo === 'editar' ? `Editar ${modal.usuario.nome}` : 'Novo usuário'}>
        {(modal?.tipo === 'novo' || modal?.tipo === 'editar') && lojas.length > 0 && (
          <FormUsuario key={modal.usuario?.id || 'novo'} inicial={modal.usuario} lojas={lojas}
            perfisPermitidos={modal.usuario?.id === perfil.id ? [modal.usuario.cargo] : permitidos} onSalvo={salvo} onCancelar={fechar} />
        )}
      </Modal>
      <Modal open={modal?.tipo === 'senha'} onOpenChange={(v) => !v && fechar()} title="Redefinir senha">
        {modal?.tipo === 'senha' && <FormSenha usuario={modal.usuario} onSalvo={salvo} onCancelar={fechar} />}
      </Modal>
      <Modal open={modal?.tipo === 'status'} onOpenChange={(v) => !v && fechar()} title={modal?.usuario?.ativo ? 'Desativar usuário?' : 'Reativar usuário?'}>
        {modal?.tipo === 'status' && (
          <div className="flex flex-col gap-6">
            <p className="text-sm">
              {modal.usuario.ativo
                ? <><b>{modal.usuario.nome}</b> não vai mais conseguir entrar no PDV, e as sessões abertas dele serão encerradas. As vendas que ele já fez continuam no histórico.</>
                : <><b>{modal.usuario.nome}</b> volta a entrar no PDV com o mesmo usuário e senha.</>}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={fechar}>Cancelar</Button>
              <Button variant={modal.usuario.ativo ? 'danger' : 'primary'} loading={processando} onClick={alternarStatus}>
                {modal.usuario.ativo ? 'Desativar usuário' : 'Reativar usuário'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
