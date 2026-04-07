import { createScriptIdDiv } from '@util/script';

// ============================================================
//  类型 & 常量
// ============================================================

type SelectedItem = {
  display: string;
  wbName?: string;
  uid?: number;
  presetPromptId?: string;
};

const C = {
  bg: '#1e1e2e',
  surface: '#313244',
  text: '#cdd6f4',
  muted: '#6c7086',
  green: '#a6e3a1',
  blue: '#89b4fa',
  btn: '#4e7dd1',
  btnHover: '#3a65b0',
};

const STORAGE_KEY = 'quick-panel-selected';

// ============================================================
//  通用 UI 工具
// ============================================================

function hoverRow($el: JQuery) {
  return $el
    .on('mouseenter', function () { $(this).css({ backgroundColor: C.surface }); })
    .on('mouseleave', function () { $(this).css({ backgroundColor: 'transparent' }); });
}

function createListItem(text: string, color: string, onClick?: () => void) {
  const $el = $('<div>').text(text).css({
    padding: '6px 12px', fontSize: '12px', color,
    cursor: 'pointer', transition: 'background-color 0.15s',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  });
  hoverRow($el);
  if (onClick) $el.on('click', onClick);
  return $el;
}

function createEmptyHint(text: string) {
  return $('<div>').text(text).css({
    padding: '8px 12px', color: C.muted, fontSize: '12px', textAlign: 'center',
  });
}

function createToggle() {
  return $('<span>').text('...').css({
    marginLeft: '6px', padding: '1px 5px', fontSize: '10px', borderRadius: '3px',
    cursor: 'pointer', backgroundColor: C.muted, color: C.bg, fontWeight: 'bold', flexShrink: 0,
  });
}

function setToggleState($el: JQuery, on: boolean) {
  $el.text(on ? 'ON' : 'OFF').css({ backgroundColor: on ? C.green : C.muted });
}

// ============================================================
//  入口
// ============================================================

$(() => {
  const parentDoc = window.parent.document;
  const parentStorage = window.parent.localStorage;
  const $container = createScriptIdDiv().appendTo(parentDoc.body);

  let panelVisible = false;
  let activeTab: string | null = null;
  let editingKey: string | null = null;

  // ---------- 持久化已选项 ----------

  const selectedItems: Map<string, SelectedItem> = new Map(
    (() => {
      try {
        const raw: [string, SelectedItem | string][] = JSON.parse(parentStorage.getItem(STORAGE_KEY) || '[]');
        return raw.map(([k, v]): [string, SelectedItem] => {
          const item: SelectedItem = typeof v === 'string' ? { display: v } : v;
          if (k.startsWith('preset:') && item.presetPromptId === undefined) item.presetPromptId = k.slice(7);
          return [k, item];
        });
      } catch { return []; }
    })(),
  );

  function save() { parentStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedItems])); }

  function addSelected(key: string, item: SelectedItem) {
    selectedItems.set(key, item);
    save();
    renderSelected();
  }

  function removeSelected(key: string) {
    if (editingKey === key) closeEditor();
    selectedItems.delete(key);
    save();
    renderSelected();
  }

  // ---------- DOM 结构 ----------

  const $panel = $('<div>').css({
    position: 'absolute', left: '8px', bottom: '92px', zIndex: 10000,
    width: '260px', maxHeight: '420px',
    backgroundColor: C.bg, borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    display: 'none', overflow: 'hidden',
  }).appendTo($container);

  const $tabs     = $('<div>').css({ display: 'flex', borderBottom: `1px solid ${C.surface}` }).appendTo($panel);
  const $selected = $('<div>').css({ padding: 0, borderBottom: `1px solid ${C.surface}`, display: 'none' }).appendTo($panel);
  const $editor   = $('<div>').css({ display: 'none', padding: '8px 12px', borderBottom: `1px solid ${C.surface}` }).appendTo($panel);
  const $list     = $('<div>').css({ maxHeight: '320px', overflowY: 'auto', padding: '2px 0' }).appendTo($panel);

  // ---------- Tab 按钮 ----------

  function createTabBtn(text: string, key: string) {
    return $('<button>').text(text).css({
      flex: '1', padding: '7px 0', fontSize: '11px',
      border: 'none', cursor: 'pointer',
      backgroundColor: 'transparent', color: C.text,
      transition: 'background-color 0.15s',
    }).on('mouseenter', function () {
      if (activeTab !== key) $(this).css({ backgroundColor: C.surface });
    }).on('mouseleave', function () {
      if (activeTab !== key) $(this).css({ backgroundColor: 'transparent' });
    }).on('click', function () {
      if (activeTab === key) { activeTab = null; $list.empty(); }
      else { activeTab = key; renderList(key); }
      syncTabStyles();
    });
  }

  const tabs: Record<string, JQuery> = {
    current: createTabBtn('当前世界书', 'current'),
    global:  createTabBtn('全局世界书', 'global'),
    preset:  createTabBtn('预设', 'preset'),
  };
  for (const btn of Object.values(tabs)) btn.appendTo($tabs);

  function syncTabStyles() {
    for (const [k, btn] of Object.entries(tabs)) {
      btn.css({
        backgroundColor: activeTab === k ? C.surface : 'transparent',
        fontWeight:       activeTab === k ? 'bold' : 'normal',
        color:            activeTab === k ? C.blue : C.text,
      });
    }
  }

  // ---------- 编辑器 ----------

  function openEditor(item: SelectedItem, key: string) {
    $editor.empty().css('display', 'block');
    editingKey = key;
    $('<div>').text('加载中...').css({ color: C.muted, fontSize: '11px' }).appendTo($editor);

    if (item.wbName !== undefined && item.uid !== undefined) openWbEditor(item.wbName, item.uid);
    else if (item.presetPromptId !== undefined) openPresetEditor(item.presetPromptId);
    else closeEditor();
  }

  function openWbEditor(wbName: string, uid: number) {
    getWorldbook(wbName).then(entries => {
      const entry = entries.find(e => e.uid === uid);
      if (!entry) { closeEditor(); return; }
      buildEditorUI(entry.name || `#${uid}`, entry.content, async (v) => {
        await updateWorldbookWith(wbName, wb => wb.map(e => e.uid === uid ? { ...e, content: v } : e));
      });
    }).catch(() => { toastr.error('加载失败'); closeEditor(); });
  }

  function openPresetEditor(promptId: string) {
    try {
      const prompt = getPreset('in_use').prompts.find(p => p.id === promptId);
      if (!prompt) { toastr.warning('未找到该提示词'); closeEditor(); return; }
      if (prompt.content === undefined) { toastr.warning('占位符不可编辑'); closeEditor(); return; }
      buildEditorUI(prompt.name, prompt.content, async (v) => {
        await updatePresetWith('in_use', p => {
          const t = p.prompts.find(pp => pp.id === promptId);
          if (t && t.content !== undefined) t.content = v;
          return p;
        });
      });
    } catch { toastr.error('加载失败'); closeEditor(); }
  }

  function buildEditorUI(title: string, content: string, onSave: (v: string) => Promise<void>) {
    $editor.empty();
    $('<div>').text(title).css({ fontSize: '11px', color: C.text, fontWeight: 'bold', marginBottom: '4px' }).appendTo($editor);

    const $ta = $('<textarea>').val(content).css({
      width: '100%', minHeight: '80px', maxHeight: '160px',
      backgroundColor: C.surface, color: C.text, border: 'none', borderRadius: '4px',
      padding: '6px', fontSize: '11px', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
    }).appendTo($editor);

    const $row = $('<div>').css({ display: 'flex', gap: '6px', marginTop: '4px' }).appendTo($editor);

    $('<button>').text('保存').css({
      flex: 1, padding: '4px', fontSize: '11px', border: 'none', borderRadius: '3px',
      backgroundColor: C.green, color: C.bg, cursor: 'pointer', fontWeight: 'bold',
    }).on('click', async () => {
      try { await onSave(($ta.val() as string) ?? ''); toastr.success('已保存'); closeEditor(); }
      catch { toastr.error('保存失败'); }
    }).appendTo($row);

    $('<button>').text('取消').css({
      flex: 1, padding: '4px', fontSize: '11px', border: 'none', borderRadius: '3px',
      backgroundColor: C.surface, color: C.text, cursor: 'pointer',
    }).on('click', () => closeEditor()).appendTo($row);
  }

  function closeEditor() {
    $editor.empty().css('display', 'none');
    editingKey = null;
  }

  // ---------- 开关工厂 ----------

  function createWbToggle(wbName: string, uid: number) {
    const $t = createToggle();
    getWorldbook(wbName).then(es => {
      const e = es.find(x => x.uid === uid);
      if (e) setToggleState($t, e.enabled);
    }).catch(() => {});
    $t.on('click', async () => {
      try {
        const e = (await getWorldbook(wbName)).find(x => x.uid === uid);
        if (!e) return;
        const v = !e.enabled;
        await updateWorldbookWith(wbName, wb => wb.map(x => x.uid === uid ? { ...x, enabled: v } : x));
        setToggleState($t, v);
      } catch { toastr.error('切换失败'); }
    });
    return $t;
  }

  function createPresetToggle(promptId: string) {
    const $t = createToggle();
    try {
      const p = getPreset('in_use').prompts.find(x => x.id === promptId);
      if (p) setToggleState($t, p.enabled);
    } catch {}
    $t.on('click', async () => {
      try {
        const p = getPreset('in_use').prompts.find(x => x.id === promptId);
        if (!p) return;
        const v = !p.enabled;
        await updatePresetWith('in_use', pr => { const t = pr.prompts.find(x => x.id === promptId); if (t) t.enabled = v; return pr; });
        setToggleState($t, v);
      } catch { toastr.error('切换失败'); }
    });
    return $t;
  }

  // ---------- 已选区域 ----------

  function isEditable(item: SelectedItem) {
    return (item.wbName !== undefined && item.uid !== undefined) || item.presetPromptId !== undefined;
  }

  function renderSelected() {
    $selected.empty();
    if (selectedItems.size === 0) { $selected.css('display', 'none'); return; }
    $selected.css('display', 'block');

    for (const [key, item] of selectedItems) {
      const $row = $('<div>').css({
        padding: '4px 12px', fontSize: '11px', color: C.green, display: 'flex', alignItems: 'center',
      });

      const editable = isEditable(item);
      $('<span>').text(item.display).css({
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        cursor: editable ? 'pointer' : 'default',
        textDecoration: editingKey === key ? 'underline' : 'none',
      }).on('click', () => {
        if (!editable) return;
        editingKey === key ? closeEditor() : openEditor(item, key);
      }).appendTo($row);

      if (item.wbName !== undefined && item.uid !== undefined) createWbToggle(item.wbName, item.uid).appendTo($row);
      if (item.presetPromptId !== undefined) createPresetToggle(item.presetPromptId).appendTo($row);

      $('<span>').text('x').css({
        cursor: 'pointer', marginLeft: '6px', color: C.muted, fontSize: '11px', flexShrink: 0,
      }).on('click', () => removeSelected(key)).appendTo($row);

      $row.appendTo($selected);
    }
  }

  // ---------- 列表渲染 ----------

  function renderList(tab: string) {
    $list.empty();
    if (tab === 'current') renderCurrentWb();
    else if (tab === 'global') renderAllWb();
    else if (tab === 'preset') renderPreset();
  }

  function renderCurrentWb() {
    const globalNames = getGlobalWorldbookNames();
    const hasChar = getCharData('current') !== null;
    const items: { name: string; tag: string }[] = [];

    for (const n of globalNames) items.push({ name: n, tag: '全局' });
    if (hasChar) {
      const cw = getCharWorldbookNames('current');
      const ch = getChatWorldbookName('current');
      if (cw.primary) items.push({ name: cw.primary, tag: '角色卡主' });
      for (const n of cw.additional) items.push({ name: n, tag: '角色卡附' });
      if (ch) items.push({ name: ch, tag: '聊天' });
    }

    if (items.length === 0) { createEmptyHint('无激活的世界书').appendTo($list); return; }
    for (const i of items) {
      createListItem(`[${i.tag}] ${i.name}`, C.green, () => renderWbEntries(i.name, `cur:${i.tag}:`)).appendTo($list);
    }
  }

  function renderAllWb() {
    const names = getWorldbookNames();
    const globals = getGlobalWorldbookNames();
    if (names.length === 0) { createEmptyHint('暂无世界书').appendTo($list); return; }
    for (const n of names) {
      const g = globals.includes(n);
      createListItem((g ? '[全局] ' : '') + n, g ? C.green : C.text, () => renderWbEntries(n, 'wb:')).appendTo($list);
    }
  }

  async function renderWbEntries(wbName: string, prefix: string) {
    $list.empty();
    createListItem('<- 返回', C.blue, () => { if (activeTab) renderList(activeTab); }).appendTo($list);
    $('<div>').text(wbName).css({ padding: '4px 12px', fontSize: '11px', color: C.muted, fontWeight: 'bold' }).appendTo($list);

    try {
      const entries = await getWorldbook(wbName);
      if (entries.length === 0) { createEmptyHint('暂无条目').appendTo($list); return; }
      for (const e of entries) {
        const name = e.name || `#${e.uid}`;
        createListItem((e.enabled ? '[ON] ' : '[OFF] ') + name, e.enabled ? C.green : C.muted, () => {
          addSelected(`${prefix}${wbName}:${e.uid}`, { display: `[${wbName}] ${name}`, wbName, uid: e.uid });
        }).appendTo($list);
      }
    } catch { createEmptyHint('获取条目失败').appendTo($list); }
  }

  function renderPreset() {
    const loadedName = getLoadedPresetName();
    $('<div>').text(`当前: ${loadedName}`).css({ padding: '4px 12px', fontSize: '11px', color: C.muted }).appendTo($list);

    const preset = getPreset('in_use');
    if (preset.prompts.length === 0) { createEmptyHint('暂无提示词').appendTo($list); return; }
    for (const p of preset.prompts) {
      createListItem((p.enabled ? '[ON] ' : '[OFF] ') + p.name, p.enabled ? C.green : C.muted, () => {
        addSelected(`preset:${p.id}`, { display: p.name, presetPromptId: p.id });
      }).appendTo($list);
    }
  }

  // ---------- 面板开关 ----------

  function togglePanel() {
    if (panelVisible) {
      $panel.css('display', 'none');
      panelVisible = false;
    } else {
      activeTab = null;
      $list.empty();
      syncTabStyles();
      renderSelected();
      $panel.css('display', 'block');
      panelVisible = true;
    }
  }

  // ---------- 入口按钮 ----------

  $('<button>').text('WB').css({
    position: 'absolute', left: '8px', bottom: '64px', zIndex: 9999,
    padding: '4px 8px', backgroundColor: C.btn, color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px',
    opacity: 0.7, transition: 'opacity 0.2s, background-color 0.2s',
  }).on('mouseenter', function () {
    $(this).css({ opacity: 1, backgroundColor: C.btnHover });
  }).on('mouseleave', function () {
    $(this).css({ opacity: 0.7, backgroundColor: C.btn });
  }).on('click', () => togglePanel()).appendTo($container);

  // ---------- 外部点击关闭 & 卸载清理 ----------

  $(document).on('mousedown.quick-panel', (e) => {
    if (panelVisible && !$(e.target).closest($container).length) {
      $panel.css('display', 'none');
      panelVisible = false;
    }
  });

  $(window).on('pagehide', () => {
    $(document).off('mousedown.quick-panel');
    $container.remove();
  });
});
