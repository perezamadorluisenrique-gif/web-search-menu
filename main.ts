import { App, FuzzySuggestModal, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import type { Editor, SettingDefinitionItem } from 'obsidian';

import { DEFAULT_ENGINES, buildUrl, cleanQuery, formatEngines, parseEngines, pickEngine, shorten } from './src/logic.ts';
import type { Engine } from './src/logic.ts';

interface WebSearchMenuSettings {
  engines: Engine[];
  /** Name of the engine the plain commands and the first menu item use. */
  defaultEngine: string;
  /** How many engines get their own item in the right-click menu; the rest sit behind "Search with...". */
  menuEngines: number;
}

const DEFAULT_SETTINGS: WebSearchMenuSettings = {
  engines: DEFAULT_ENGINES,
  defaultEngine: 'Google',
  menuEngines: 2,
};

const TITLE_LENGTH = 28;

export default class WebSearchMenuPlugin extends Plugin {
  settings: WebSearchMenuSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    const saved = (await this.loadData()) as Partial<WebSearchMenuSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (!Array.isArray(this.settings.engines) || this.settings.engines.length === 0) this.settings.engines = DEFAULT_ENGINES;
    this.addSettingTab(new WebSearchMenuSettingTab(this.app, this));

    this.addCommand({
      id: 'search-selection',
      name: 'Search the web for the selection',
      icon: 'search',
      checkCallback: (checking) => this.ifQuery(checking, () => this.selectionText(), (q) => this.searchWith(this.defaultEngine(), q)),
    });
    this.addCommand({
      id: 'search-selection-with',
      name: 'Search the web for the selection with...',
      icon: 'globe',
      checkCallback: (checking) => this.ifQuery(checking, () => this.selectionText(), (q) => this.pickAndSearch(q)),
    });
    this.addCommand({
      id: 'search-title',
      name: 'Search the web for the note title',
      icon: 'file-search',
      checkCallback: (checking) => this.ifQuery(checking, () => this.activeTitle(), (q) => this.searchWith(this.defaultEngine(), q)),
    });
    this.addCommand({
      id: 'search-title-with',
      name: 'Search the web for the note title with...',
      icon: 'globe',
      checkCallback: (checking) => this.ifQuery(checking, () => this.activeTitle(), (q) => this.pickAndSearch(q)),
    });

    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        const query = cleanQuery(editor.getSelection());
        if (query) this.addMenuItems(menu, query);
      }),
    );
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        this.addMenuItems(menu, cleanQuery(file.basename));
      }),
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  defaultEngine(): Engine {
    return pickEngine(this.settings.engines, this.settings.defaultEngine) ?? DEFAULT_ENGINES[0];
  }

  /** Items for `query`: the default engine first, then the next few, then a picker. */
  private addMenuItems(menu: { addItem(cb: (item: MenuItemLike) => void): unknown; addSeparator(): unknown }, query: string) {
    const label = shorten(query, TITLE_LENGTH);
    const def = this.defaultEngine();
    const shown = [def, ...this.settings.engines.filter((e) => e !== def)].slice(0, Math.max(1, this.settings.menuEngines));
    menu.addSeparator();
    for (const engine of shown) {
      menu.addItem((item) => item.setTitle(`Search ${engine.name} for “${label}”`).setIcon('search').onClick(() => this.searchWith(engine, query)));
    }
    if (this.settings.engines.length > shown.length) {
      menu.addItem((item) => item.setTitle('Search the web with...').setIcon('globe').onClick(() => this.pickAndSearch(query)));
    }
  }

  private searchWith(engine: Engine, query: string) {
    const url = buildUrl(engine.url, query);
    if (!url) {
      new Notice(`Could not search ${engine.name}: check its address in the settings.`);
      return;
    }
    window.open(url);
  }

  private pickAndSearch(query: string) {
    new EnginePicker(this.app, this.settings.engines, query, (engine) => this.searchWith(engine, query)).open();
  }

  /** Runs `run` with the query, or tells `checkCallback` whether there is one. */
  private ifQuery(checking: boolean, get: () => string, run: (query: string) => void): boolean {
    const query = cleanQuery(get());
    if (!query) return false;
    if (!checking) run(query);
    return true;
  }

  private selectionText(): string {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return '';
    const editor: Editor = view.editor;
    if (view.getMode() === 'source') return editor.getSelection();
    return window.getSelection()?.toString() ?? '';
  }

  private activeTitle(): string {
    return this.app.workspace.getActiveFile()?.basename ?? '';
  }
}

interface MenuItemLike {
  setTitle(title: string): MenuItemLike;
  setIcon(icon: string | null): MenuItemLike;
  onClick(cb: (evt: MouseEvent | KeyboardEvent) => unknown): MenuItemLike;
}

class EnginePicker extends FuzzySuggestModal<Engine> {
  constructor(
    app: App,
    private engines: Engine[],
    query: string,
    private choose: (engine: Engine) => void,
  ) {
    super(app);
    this.setPlaceholder(`Search the web for “${shorten(query, 40)}” with...`);
  }

  getItems(): Engine[] {
    return this.engines;
  }

  getItemText(engine: Engine): string {
    return engine.name;
  }

  onChooseItem(engine: Engine): void {
    this.choose(engine);
  }
}

const TEXT = {
  engines: {
    name: 'Search engines',
    desc: 'One per line: a name, a bar, then the address with {query} where the search text goes. Example: Google | https://www.google.com/search?q={query}. Empty goes back to the built-in list.',
  },
  defaultEngine: { name: 'Default engine', desc: 'Used by the plain commands and listed first in the menus.' },
  menuEngines: {
    name: 'Engines in the menu',
    desc: 'How many engines get their own item in the right-click menu. The others are one click away under the picker item.',
  },
};

class WebSearchMenuSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: WebSearchMenuPlugin,
  ) {
    super(app, plugin);
  }

  /**
   * The settings, described rather than drawn. Obsidian 1.13 and later
   * renders this itself and indexes it for the settings search. Older
   * versions ignore it and call `display()`.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const s = this.plugin.settings;
    const options: Record<string, string> = {};
    for (const e of s.engines) options[e.name] = e.name;
    return [
      {
        ...TEXT.engines,
        control: { type: 'textarea', key: 'engines', rows: 8, validate: (v: string) => parseEngines(v).problems.join(' ') },
      },
      { ...TEXT.defaultEngine, control: { type: 'dropdown', key: 'defaultEngine', options, defaultValue: DEFAULT_SETTINGS.defaultEngine } },
      { ...TEXT.menuEngines, control: { type: 'slider', key: 'menuEngines', min: 1, max: 6, step: 1, defaultValue: DEFAULT_SETTINGS.menuEngines } },
    ];
  }

  getControlValue(key: string): unknown {
    const s = this.plugin.settings;
    return key === 'engines' ? formatEngines(s.engines) : (s as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const s = this.plugin.settings;
    if (key === 'engines') {
      const parsed = parseEngines(String(value));
      s.engines = parsed.engines.length > 0 ? parsed.engines : DEFAULT_ENGINES.map((e) => ({ ...e }));
    } else if (key === 'menuEngines') s.menuEngines = Math.max(1, Math.round(Number(value)) || 1);
    else if (key === 'defaultEngine') s.defaultEngine = String(value);
    await this.plugin.saveSettings();
  }

  /** The pre-1.13 rendering, from the same text. Obsidian skips it once `getSettingDefinitions()` returns anything. */
  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    const problems = containerEl.createDiv({ cls: 'setting-item-description' });
    new Setting(containerEl)
      .setName(TEXT.engines.name)
      .setDesc(TEXT.engines.desc)
      .addTextArea((area) => {
        area.inputEl.rows = 8;
        area.setValue(formatEngines(s.engines)).onChange((value) => {
          problems.setText(parseEngines(value).problems.join(' '));
          void this.setControlValue('engines', value);
        });
      });
    containerEl.appendChild(problems);

    new Setting(containerEl)
      .setName(TEXT.defaultEngine.name)
      .setDesc(TEXT.defaultEngine.desc)
      .addDropdown((dd) => {
        for (const e of s.engines) dd.addOption(e.name, e.name);
        dd.setValue(pickEngine(s.engines, s.defaultEngine)?.name ?? '').onChange((v) => void this.setControlValue('defaultEngine', v));
      });

    new Setting(containerEl)
      .setName(TEXT.menuEngines.name)
      .setDesc(TEXT.menuEngines.desc)
      .addSlider((sl) => sl.setLimits(1, 6, 1).setValue(s.menuEngines).onChange((v) => void this.setControlValue('menuEngines', v)));
  }
}
