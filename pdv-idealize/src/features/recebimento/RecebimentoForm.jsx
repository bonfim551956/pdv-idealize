import { useEffect, useState } from 'react'
import { supabase, mensagemErro } from '../../lib/supabase'
import { brl, parseNum, hojeISO, somaMesesISO, dividirParcelas } from '../../lib/format'
import { Button, Field, Input, Select, Alert, Chips, useToast } from '../../components/ui'

export const FORMAS = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  CARTEIRA_DIGITAL: 'Carteira digital',
  CARTAO: 'Cartão',
  CARNE: 'Carnê',
  BOLETO: 'Boleto',
  CHEQUE: 'Cheque',
  CREDITOS: 'Créditos',
}
const COM_PARCELAS = ['CARNE', 'BOLETO', 'CHEQUE']
const ADQUIRENTES = ['Stone', 'Cielo', 'Rede', 'PagSeguro', 'GetNet', 'Mercado Pago', 'Outro']
const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'Hipercard', 'American Express', 'Outra']
const CARTEIRAS = ['PicPay', 'Mercado Pago', 'Apple Pay', 'Google Pay', 'Outra']

const brlInput = (n) => Number(n || 0).toFixed(2).replace('.', ',')

export default function RecebimentoForm({ venda, saldo, caixas, forma, onCancelar, onSalvo }) {
  const toast = useToast()
  const [valor, setValor] = useState(brlInput(saldo))
  const [data, setData] = useState(hojeISO())
  const [caixaId, setCaixaId] = useState(caixas[0]?.id || '')
  const [modalidade, setModalidade] = useState('CREDITO')
  const [parcelas, setParcelas] = useState(1)
  const [adquirente, setAdquirente] = useState('')
  const [bandeira, setBandeira] = useState('')
  const [nsu, setNsu] = useState('')
  const [autorizacao, setAutorizacao] = useState('')
  const [carteira, setCarteira] = useState('')
  const [primeiroVenc, setPrimeiroVenc] = useState(somaMesesISO(hojeISO(), 1))
  const [detalhe, setDetalhe] = useState([])
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const v = parseNum(valor)
  const valorOk = v !== null && !Number.isNaN(v) && v > 0 && v <= saldo + 0.001

  // Gera parcelas de carnê / boleto / cheque sempre que valor, quantidade ou 1º vencimento mudam
  useEffect(() => {
    if (!COM_PARCELAS.includes(forma) || !valorOk) { setDetalhe([]); return }
    const valores = dividirParcelas(v, parcelas)
    setDetalhe((ant) => valores.map((val, i) => ({
      valor: val,
      vencimento: somaMesesISO(primeiroVenc, i),
      documento: ant[i]?.documento || '',
      banco: ant[i]?.banco || '',
    })))
  }, [forma, valor, parcelas, primeiroVenc]) // eslint-disable-line

  const setDet = (i, k, val) => setDetalhe((d) => d.map((p, j) => (j === i ? { ...p, [k]: val } : p)))

  const salvar = async (e) => {
    e.preventDefault()
    setErro(null)
    if (!valorOk) { setErro(`Informe um valor entre R$ 0,01 e ${brl(saldo)}.`); return }
    if (!caixaId) { setErro('Escolha o caixa.'); return }
    if (forma === 'CARTAO' && (!adquirente || !bandeira)) { setErro('Informe a adquirente e a bandeira do cartão.'); return }
    if (forma === 'CARTEIRA_DIGITAL' && !carteira) { setErro('Informe a carteira digital.'); return }
    if (forma === 'BOLETO' && detalhe.some((p) => !p.documento.trim())) { setErro('Informe o número de cada boleto.'); return }

    const cartaoParcelado = forma === 'CARTAO' && modalidade === 'CREDITO' && parcelas > 1
    const parcelasDetalhe = COM_PARCELAS.includes(forma)
      ? detalhe
      : cartaoParcelado
        ? dividirParcelas(v, parcelas).map((val, i) => ({ valor: val, vencimento: somaMesesISO(data, i + 1) }))
        : []

    setSalvando(true)
    const { error } = await supabase.rpc('registrar_recebimento', {
      p: {
        venda_id: venda.id,
        caixa_id: caixaId,
        forma,
        valor: v,
        data_entrada: data,
        modalidade: forma === 'CARTAO' ? modalidade : null,
        parcelas: forma === 'CARTAO' || COM_PARCELAS.includes(forma) ? (modalidade === 'DEBITO' && forma === 'CARTAO' ? 1 : parcelas) : null,
        com_juros: forma === 'CARTAO' ? false : null,
        adquirente, bandeira, nsu, autorizacao, carteira,
        parcelas_detalhe: parcelasDetalhe,
      },
    })
    setSalvando(false)
    if (error) { setErro(mensagemErro(error)); return }
    toast(`${FORMAS[forma]} de ${brl(v)} registrado`)
    onSalvo()
  }

  const qtdMax = forma === 'CARTAO' ? 12 : 12

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Valor (R$)" required hint={`Saldo: ${brl(saldo)}`}>
          {({ id }) => <Input id={id} inputMode="decimal" className="num text-right" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ''))} />}
        </Field>
        <Field label="Data de entrada">
          {({ id }) => <Input id={id} type="date" value={data} onChange={(e) => setData(e.target.value)} />}
        </Field>
        <Field label="Caixa" required>
          {({ id }) => (
            <Select id={id} value={caixaId} onChange={(e) => setCaixaId(e.target.value)}>
              {caixas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          )}
        </Field>
      </div>

      {forma === 'CARTAO' && (
        <div className="flex flex-col gap-4">
          <Chips label="Modalidade" value={modalidade} onChange={(m) => { if (m) { setModalidade(m); if (m === 'DEBITO') setParcelas(1) } }}
            options={[{ value: 'CREDITO', label: 'Crédito' }, { value: 'DEBITO', label: 'Débito' }]} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Parcelas">
              {({ id }) => (
                <Select id={id} value={parcelas} disabled={modalidade === 'DEBITO'} onChange={(e) => setParcelas(Number(e.target.value))}>
                  {Array.from({ length: qtdMax }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}x {valorOk ? brl(v / n) : ''} sem juros</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Adquirente" required>
              {({ id }) => (
                <Select id={id} value={adquirente} onChange={(e) => setAdquirente(e.target.value)}>
                  <option value="">Selecione</option>{ADQUIRENTES.map((a) => <option key={a}>{a}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Bandeira" required>
              {({ id }) => (
                <Select id={id} value={bandeira} onChange={(e) => setBandeira(e.target.value)}>
                  <option value="">Selecione</option>{BANDEIRAS.map((b) => <option key={b}>{b}</option>)}
                </Select>
              )}
            </Field>
            <Field label="NSU" hint="Está no comprovante da maquininha">
              {({ id }) => <Input id={id} inputMode="numeric" className="num" value={nsu} onChange={(e) => setNsu(e.target.value)} />}
            </Field>
            <Field label="Código de autorização">
              {({ id }) => <Input id={id} className="num" value={autorizacao} onChange={(e) => setAutorizacao(e.target.value.toUpperCase())} />}
            </Field>
          </div>
        </div>
      )}

      {forma === 'CARTEIRA_DIGITAL' && (
        <Field label="Carteira" required className="sm:max-w-xs">
          {({ id }) => (
            <Select id={id} value={carteira} onChange={(e) => setCarteira(e.target.value)}>
              <option value="">Selecione</option>{CARTEIRAS.map((c) => <option key={c}>{c}</option>)}
            </Select>
          )}
        </Field>
      )}

      {COM_PARCELAS.includes(forma) && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Quantidade de parcelas">
              {({ id }) => (
                <Select id={id} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}x</option>)}
                </Select>
              )}
            </Field>
            <Field label="1º vencimento">
              {({ id }) => <Input id={id} type="date" value={primeiroVenc} onChange={(e) => setPrimeiroVenc(e.target.value)} />}
            </Field>
          </div>
          {detalhe.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-line bg-bg text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Parcela</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                    <th className="px-3 py-2 font-medium">Vencimento</th>
                    <th className="px-3 py-2 font-medium">{forma === 'BOLETO' ? 'Nº do boleto' : forma === 'CHEQUE' ? 'Nº do cheque' : 'Nº do carnê'}</th>
                    {forma === 'CHEQUE' && <th className="px-3 py-2 font-medium">Banco</th>}
                  </tr>
                </thead>
                <tbody>
                  {detalhe.map((p, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 num font-semibold">{i + 1}ª</td>
                      <td className="px-3 py-2 text-right num">{brl(p.valor)}</td>
                      <td className="px-3 py-2"><Input aria-label={`Vencimento parcela ${i + 1}`} type="date" className="h-10" value={p.vencimento} onChange={(e) => setDet(i, 'vencimento', e.target.value)} /></td>
                      <td className="px-3 py-2"><Input aria-label={`Documento parcela ${i + 1}`} className="h-10 num" value={p.documento} onChange={(e) => setDet(i, 'documento', e.target.value)} /></td>
                      {forma === 'CHEQUE' && <td className="px-3 py-2"><Input aria-label={`Banco parcela ${i + 1}`} className="h-10" value={p.banco} onChange={(e) => setDet(i, 'banco', e.target.value)} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {erro && <Alert>{erro}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button type="submit" loading={salvando} disabled={!valorOk}>Registrar {FORMAS[forma].toLowerCase()}</Button>
      </div>
    </form>
  )
}
