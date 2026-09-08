// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GridIcon, TableIcon } from 'lucide-react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { ToolbarSegmented } from './ToolbarControls';

afterEach(cleanup);

it('keeps one view selected and supports keyboard switching with icon tooltips', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Harness() {
        const [value, setValue] = useState<'table' | 'grid'>('table');
        return (
            <ToolbarSegmented
                iconOnly
                value={value}
                onValueChange={(next) => {
                    setValue(next);
                    onChange(next);
                }}
                options={[
                    { value: 'table', label: 'Table', icon: TableIcon },
                    { value: 'grid', label: 'Grid', icon: GridIcon }
                ]}
            />
        );
    }
    render(<Harness />);
    const table = screen.getByRole('button', { name: 'Table' });
    const grid = screen.getByRole('button', { name: 'Grid' });

    await user.click(table);
    expect(onChange).not.toHaveBeenCalled();
    expect(table.getAttribute('aria-pressed')).toBe('true');

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(grid);
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('grid');
    expect(grid.getAttribute('aria-pressed')).toBe('true');
    expect(table.getAttribute('aria-pressed')).toBe('false');
});
