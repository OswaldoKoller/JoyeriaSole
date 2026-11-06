import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input.tsx';

describe('Input', () => {
  it('asocia la etiqueta con el campo', () => {
    render(<Input label="Nombre" />);
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
  });

  it('respeta el id que pasa el llamador', () => {
    render(<Input label="Nombre" id="campo-nombre" />);
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('id', 'campo-nombre');
  });

  it('conserva la ayuda del llamador (aria-describedby)', () => {
    render(
      <>
        <Input label="Código" aria-describedby="ayuda" />
        <p id="ayuda">Un lector escribe el código y pulsa Enter.</p>
      </>,
    );
    expect(screen.getByLabelText('Código')).toHaveAccessibleDescription(
      'Un lector escribe el código y pulsa Enter.',
    );
  });

  it('combina la ayuda con el mensaje de error', () => {
    render(
      <>
        <Input label="Código" aria-describedby="ayuda" error="Es obligatorio" />
        <p id="ayuda">Ayuda del campo.</p>
      </>,
    );
    const field = screen.getByLabelText('Código');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Ayuda del campo. Es obligatorio');
  });

  it('solo el error describe el campo cuando no hay ayuda', () => {
    render(<Input label="Código" error="Es obligatorio" />);
    expect(screen.getByLabelText('Código')).toHaveAccessibleDescription('Es obligatorio');
  });
});
