// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsProvider } from '../../settings/SettingsContext';
import { SettingsPage } from './SettingsPage';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

function renderSettingsPage() {
  return render(
    <SettingsProvider>
      <SettingsPage />
    </SettingsProvider>,
  );
}

describe('SettingsPage 版面尺寸清單：名稱唯一化', () => {
  it('連按兩次「新增尺寸」，新增的兩列名稱不相同', () => {
    renderSettingsPage();
    const addButton = screen.getByTestId('settings-add-sheet-size');

    fireEvent.click(addButton);
    fireEvent.click(addButton);

    const nameInputs = screen.getAllByTestId(/^sheet-size-name-\d+$/) as HTMLInputElement[];
    const last = nameInputs[nameInputs.length - 1];
    const secondLast = nameInputs[nameInputs.length - 2];
    expect(last.value).not.toBe(secondLast.value);
  });

  it('把某一列改名成另一列既有的名稱時，該列名稱還原成原值', () => {
    renderSettingsPage();
    const nameInput1 = screen.getByTestId('sheet-size-name-1') as HTMLInputElement;
    const originalName1 = nameInput1.value;
    const nameInput0 = screen.getByTestId('sheet-size-name-0') as HTMLInputElement;
    const existingName0 = nameInput0.value;

    fireEvent.change(nameInput1, { target: { value: existingName0 } });
    fireEvent.blur(nameInput1);

    expect(nameInput1.value).toBe(originalName1);
  });

  it('真實事件順序（先 blur 再點擊）下，編輯中的草稿會被提交，不會被清單變動覆寫', () => {
    renderSettingsPage();
    const nameInput1 = screen.getByTestId('sheet-size-name-1') as HTMLInputElement;

    fireEvent.change(nameInput1, { target: { value: 'MID_EDIT_DRAFT' } });
    fireEvent.blur(nameInput1);

    const deleteButton0 = screen.getByTestId('sheet-size-delete-0');
    fireEvent.click(deleteButton0);

    const nameInput0 = screen.getByTestId('sheet-size-name-0') as HTMLInputElement;
    expect(nameInput0.value).toBe('MID_EDIT_DRAFT');
  });
});
