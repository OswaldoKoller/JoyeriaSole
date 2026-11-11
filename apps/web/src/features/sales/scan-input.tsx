import { useState, type Ref, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';

/**
 * Campo del lector de códigos. Los lectores USB o Bluetooth se comportan como un teclado: escriben
 * el código y pulsan Enter (no se integra ninguna marca). También sirve para escribir a mano un
 * SKU, un código o parte del nombre. Tras cada lectura el campo se vacía; el foco lo devuelve la
 * pantalla con `ref`.
 */
export function ScanInput({
  onScan,
  busy,
  ref,
}: {
  onScan: (code: string) => Promise<void>;
  busy: boolean;
  ref?: Ref<HTMLInputElement>;
}) {
  const [code, setCode] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = code.trim();
    if (!term || busy) return;
    setCode('');
    await onScan(term);
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-2">
      <div className="min-w-52 flex-1">
        <Input
          ref={ref}
          label="Código de la pieza"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
          }}
          maxLength={64}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby="scan-help"
          autoFocus
        />
      </div>
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? 'Buscando…' : 'Agregar'}
      </Button>
      <p id="scan-help" className="w-full text-xs text-stone-600">
        Escanee el código de barras o escriba el SKU o el nombre y pulse Enter.
      </p>
    </form>
  );
}
