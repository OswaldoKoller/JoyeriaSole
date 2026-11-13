import { ERROR_CODES, openCashSessionSchema, type CashSessionDetail } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { isBlank, normalizeMoneyText } from '../../lib/money-input.ts';
import { useOpenCash } from './use-cash.ts';

/**
 * Apertura de la caja (B4, D-05): el fondo inicial es obligatorio y se escribe en cada apertura,
 * sin arrastre. Un campo vacío NO es cero: para abrir sin fondo hay que escribir «0».
 */
export function OpenCashDialog({
  onClose,
  onOpened,
}: {
  onClose: () => void;
  onOpened: (session: CashSessionDetail) => void;
}) {
  const open = useOpenCash();
  const [amount, setAmount] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (isBlank(amount)) {
      setFieldError('Indique el fondo inicial. Si no hay fondo, escriba 0.');
      return;
    }
    const parsed = openCashSessionSchema.safeParse({ openingAmount: normalizeMoneyText(amount) });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Importe inválido');
      return;
    }
    setFieldError('');
    try {
      onOpened(await open.mutateAsync(parsed.data));
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === ERROR_CODES.CASH_SESSION_ALREADY_OPEN) {
        setError('Ya hay una caja abierta. Actualice la pantalla para verla.');
      } else {
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'No se pudo comunicar con el servidor. Puede reintentar: la caja no se abrirá dos veces.',
        );
      }
    }
  }

  return (
    <Dialog title="Abrir caja" onClose={onClose} busy={open.isPending}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
        <Input
          label="Fondo inicial (Bs)"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
          }}
          error={fieldError}
          aria-describedby="open-cash-help"
          data-autofocus
        />
        <p id="open-cash-help" className="text-sm text-stone-600">
          Cuente el efectivo con el que inicia la caja. Use coma o punto para los centavos.
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={open.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={open.isPending}>
            {open.isPending ? 'Abriendo…' : 'Abrir caja'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
