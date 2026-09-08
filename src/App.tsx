import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { createItem, createList, deleteItem, deleteList, getItemHistory, getItems, getLists, updateItem } from './storage'
import type { HistoryEntry, Item, ItemInput, ItemList, Page } from './types'

type ComposerState = { mode: 'create' | 'edit'; item?: Item } | null

const actionLabels = { created: '新建物品', updated: '修改物品', deleted: '删除物品' }

function formatTime(timestamp: number) {
  if (!timestamp) return '未知时间'
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

function App() {
  const [page, setPage] = useState<Page>('items')
  const [lists, setLists] = useState<ItemList[]>([])
  const [activeList, setActiveList] = useState('placed')
  const [items, setItems] = useState<Item[]>([])
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [composer, setComposer] = useState<ComposerState>(null)
  const [showListComposer, setShowListComposer] = useState(false)
  const [historyItem, setHistoryItem] = useState<Item | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshLists = async (preferredId?: string) => {
    const nextLists = await getLists()
    setLists(nextLists)
    if (nextLists.length && (!nextLists.some((list) => list.id === activeList) || preferredId)) setActiveList(preferredId || nextLists[0].id)
    return nextLists
  }

  useEffect(() => {
    void (async () => {
      try {
        const nextLists = await getLists()
        setLists(nextLists)
        if (nextLists.length) setActiveList(nextLists[0].id)
      } catch (cause) { setError(cause instanceof Error ? cause.message : '加载数据失败') }
      finally { setLoading(false) }
    })()
  }, [])

  useEffect(() => {
    if (!activeList) return
    void getItems(activeList).then(setItems).catch((cause) => setError(cause instanceof Error ? cause.message : '加载物品失败'))
  }, [activeList])

  const activeListName = useMemo(() => lists.find((list) => list.id === activeList)?.name || '物品', [lists, activeList])

  const saveItem = async (input: ItemInput) => {
    try {
      setError('')
      if (composer?.mode === 'edit' && composer.item) await updateItem(composer.item.id, input)
      else await createItem(input)
      await refreshLists()
      setItems(await getItems(activeList))
      setComposer(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存物品失败') }
  }

  const removeItem = async (item: Item) => {
    if (!window.confirm(`确定删除“${item.name}”吗？删除操作会保留在历史记录中。`)) return
    try { await deleteItem(item.id); await refreshLists(); setItems(await getItems(activeList)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '删除物品失败') }
  }

  const showHistory = async (item: Item) => {
    try { setHistoryItem(item); setHistory(await getItemHistory(item.id)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '加载历史失败') }
  }

  const saveList = async (name: string) => {
    try { const list = await createList(name); await refreshLists(list.id); setShowListComposer(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '创建列表失败') }
  }

  const removeList = async () => {
    if (lists.length <= 1) { setError('至少需要保留一个列表'); return }
    if (!window.confirm(`确定删除“${activeListName}”列表吗？`)) return
    try { await deleteList(activeList); const nextLists = await refreshLists(); setActiveList(nextLists[0]?.id || '') }
    catch (cause) { setError(cause instanceof Error ? cause.message : '删除列表失败') }
  }

  return <div className={`app-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">W</span><span>WHERE</span></div>
      <div className="workspace-label">我的空间</div>
      <nav className="main-nav" aria-label="主导航">
        <NavButton active={page === 'items'} icon="⌂" label="物品位置" onClick={() => setPage('items')} />
        <NavButton active={page === 'agent'} icon="✦" label="智能体" onClick={() => setPage('agent')} badge="Beta" />
        <NavButton active={page === 'profile'} icon="○" label="我的" onClick={() => setPage('profile')} />
      </nav>
      <div className="sidebar-foot"><div className="sync-state"><span className="status-dot" />本地数据已保存</div><div className="build-label">WHERE 0.3.0 · Items</div></div>
    </aside>
    <main className="main-content">
      {page === 'items' && <ItemsPage lists={lists} activeList={activeList} activeListName={activeListName} items={items} loading={loading} onSelectList={setActiveList} onAdd={() => setComposer({ mode: 'create' })} onEdit={(item) => setComposer({ mode: 'edit', item })} onDelete={removeItem} onHistory={showHistory} onAddList={() => setShowListComposer(true)} onDeleteList={removeList} />}
      {page === 'agent' && <AgentPage onNavigateToItems={() => setPage('items')} />}
      {page === 'profile' && <ProfilePage theme={theme} setTheme={setTheme} />}
    </main>
    {error && <div className="toast" role="alert"><span>!</span>{error}<button onClick={() => setError('')}>×</button></div>}
    {composer && <ItemComposer lists={lists} activeList={activeList} state={composer} onClose={() => setComposer(null)} onSave={saveItem} />}
    {showListComposer && <ListComposer onClose={() => setShowListComposer(false)} onSave={saveList} />}
    {historyItem && <HistoryModal item={historyItem} history={history} onClose={() => setHistoryItem(null)} />}
  </div>
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: string; label: string; badge?: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><span className="icon" aria-hidden="true">{icon}</span><span>{label}</span>{badge && <small>{badge}</small>}</button>
}

function ItemsPage({ lists, activeList, activeListName, items, loading, onSelectList, onAdd, onEdit, onDelete, onHistory, onAddList, onDeleteList }: { lists: ItemList[]; activeList: string; activeListName: string; items: Item[]; loading: boolean; onSelectList: (id: string) => void; onAdd: () => void; onEdit: (item: Item) => void; onDelete: (item: Item) => void; onHistory: (item: Item) => void; onAddList: () => void; onDeleteList: () => void }) {
  return <>
    <header className="topbar"><div><div className="eyebrow">我的物品</div><h1>物品位置</h1></div><div className="topbar-actions"><button className="ghost-button" title="搜索">⌕ <span>搜索</span><kbd>⌘ K</kbd></button><button className="avatar">Z</button></div></header>
    <section className="page-intro"><p>把重要的东西，放在记得住的地方。</p><button className="primary-button" onClick={onAdd}><span>＋</span> 添加物品</button></section>
    <div className="list-tabs" role="tablist" aria-label="物品列表">{lists.map((list) => <button key={list.id} role="tab" aria-selected={activeList === list.id} className={`list-tab ${activeList === list.id ? 'active' : ''}`} onClick={() => onSelectList(list.id)}><span className="tab-icon">{list.icon}</span><span>{list.name}</span><span className="tab-count">{list.count}</span></button>)}<button className="add-list-button" title="新建列表" onClick={onAddList}>＋</button><button className="list-settings-button" title="删除当前列表" onClick={onDeleteList}>•••</button></div>
    <section className="items-panel"><div className="panel-heading"><div><h2>{activeListName}</h2><span className="muted">按最近更新排序 · 本地数据库</span></div></div>
      {loading ? <div className="loading-state"><span className="spinner" />正在打开本地数据…</div> : items.length ? <div className="item-list">{items.map((item) => <ItemRow key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} onHistory={onHistory} />)}</div> : <EmptyState onAdd={onAdd} />}
    </section>
    <div className="hint-bar"><span className="hint-key">⌁</span><span>物品写入本地 SQLite，并为每次新建、修改和删除保留历史记录</span></div>
  </>
}

function ItemRow({ item, onEdit, onDelete, onHistory }: { item: Item; onEdit: (item: Item) => void; onDelete: (item: Item) => void; onHistory: (item: Item) => void }) {
  return <article className="item-row"><div className="item-icon">{item.icon}</div><div className="item-main"><div className="item-title"><strong>{item.name}</strong><span className="list-pill">{item.listName}</span></div><div className="item-location"><span className="location-pin">⌖</span>{item.location}</div>{item.note && <div className="item-note">▤ {item.note}</div>}</div><div className="item-meta"><span>{formatTime(item.updatedAt)}</span><div className="row-actions"><button onClick={() => onEdit(item)}>编辑</button><button onClick={() => onHistory(item)}>历史</button><button className="danger-text" onClick={() => onDelete(item)}>删除</button></div></div></article>
}

function EmptyState({ onAdd }: { onAdd: () => void }) { return <div className="empty-state"><div className="empty-art">⌂</div><h3>这里还没有物品</h3><p>从记录一件你经常找不到的东西开始。</p><button className="secondary-button" onClick={onAdd}>添加第一件物品</button></div> }

function ItemComposer({ lists, activeList, state, onClose, onSave }: { lists: ItemList[]; activeList: string; state: Exclude<ComposerState, null>; onClose: () => void; onSave: (input: ItemInput) => void }) {
  const [name, setName] = useState(state.item?.name || '')
  const [location, setLocation] = useState(state.item?.location || '')
  const [note, setNote] = useState(state.item?.note || '')
  const [listId, setListId] = useState(state.item?.listId || activeList)
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim() && location.trim()) void onSave({ listId, name, location, note }) }
  return <Modal onClose={onClose}><form onSubmit={submit}><div className="modal-heading"><div><div className="eyebrow">{state.mode === 'edit' ? '编辑记录' : '快速记录'}</div><h2>{state.mode === 'edit' ? '编辑物品' : '添加物品'}</h2></div><button type="button" className="close-button" onClick={onClose}>×</button></div><label>物品名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：钥匙、雨伞" /></label><label>所属列表<select value={listId} onChange={(event) => setListId(event.target.value)}>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label><label>位置<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="例如：玄关柜的第二层" /></label><label>备注 <span className="optional">可选</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="补充颜色、数量或其他信息" rows={3} /></label><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={!name.trim() || !location.trim()}>{state.mode === 'edit' ? '保存修改' : '保存物品'}</button></div></form></Modal>
}

function ListComposer({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => void }) { const [name, setName] = useState(''); return <Modal onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (name.trim()) void onSave(name) }}><div className="modal-heading"><div><div className="eyebrow">自定义分类</div><h2>新建列表</h2></div><button type="button" className="close-button" onClick={onClose}>×</button></div><label>列表名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：借出、旅行箱" /></label><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={!name.trim()}>创建列表</button></div></form></Modal> }

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(event) => event.stopPropagation()}>{children}</div></div> }

function HistoryModal({ item, history, onClose }: { item: Item; history: HistoryEntry[]; onClose: () => void }) { return <Modal onClose={onClose}><div className="modal-heading"><div><div className="eyebrow">变更审计</div><h2>{item.name}的历史</h2></div><button className="close-button" onClick={onClose}>×</button></div>{history.length ? <div className="history-list">{history.map((entry) => <div className="history-entry" key={entry.id}><span className="history-dot" /><div><strong>{actionLabels[entry.action]}</strong><small>{formatTime(entry.createdAt)}</small>{entry.action === 'updated' && entry.beforeJson && entry.afterJson && <p>{JSON.parse(entry.beforeJson).location}　→　{JSON.parse(entry.afterJson).location}</p>}</div></div>)}</div> : <div className="history-empty">暂无历史记录</div>}</Modal> }

function AgentPage({ onNavigateToItems }: { onNavigateToItems: () => void }) { const [message, setMessage] = useState(''); return <><header className="topbar"><div><div className="eyebrow">WHERE AI</div><h1>智能体</h1></div><div className="agent-model"><span className="status-dot" />本地工具已就绪</div></header><section className="agent-layout"><div className="agent-welcome"><div className="sparkle">✦</div><h2>你好，我可以帮你找东西。</h2><p>告诉我物品放在哪里，或者问我它现在在哪里。所有操作都会先经过本地数据校验。</p><div className="quick-prompts"><button onClick={() => setMessage('帮我记录：雨伞放在书柜的架子上')}>记录一个物品 <span>→</span></button><button onClick={() => setMessage('我的电动车停哪了？')}>查找我的电动车 <span>→</span></button><button onClick={() => setMessage('床头柜里存放了哪些东西？')}>查看床头柜 <span>→</span></button></div></div><div className="workflow-card"><div className="workflow-title"><span>最近一次工作流</span><span className="live-pill">示例</span></div><WorkflowStep title="理解请求" detail="识别为物品位置查询" /><div className="workflow-line" /><WorkflowStep title="检索本地数据" detail="按“电动车”匹配 1 条记录" /><div className="workflow-line" /><WorkflowStep current title="整理结果" detail="等待下一次对话" /></div></section><section className="chat-composer"><div className="composer-tools"><span className="composer-icon">✦</span><span>使用 WHERE 智能体</span><span className="composer-divider" /><button>＋ 添加上下文</button></div><div className="composer-input"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="问问你的物品在哪里……" /><button className="send-button" onClick={onNavigateToItems} disabled={!message}>↑</button></div><div className="composer-foot">智能体会使用你当前账号中的本地数据　·　<button>了解能力范围</button></div></section></> }

function WorkflowStep({ title, detail, current = false }: { title: string; detail: string; current?: boolean }) { return <div className={`workflow-step ${current ? 'current' : 'done'}`}><span className="step-check">{current ? '✦' : '✓'}</span><div><strong>{title}</strong><small>{detail}</small></div></div> }

function ProfilePage({ theme, setTheme }: { theme: 'light' | 'dark'; setTheme: (theme: 'light' | 'dark') => void }) { return <><header className="topbar"><div><div className="eyebrow">设置与账户</div><h1>我的</h1></div><button className="avatar large">Z</button></header><section className="profile-content"><div className="profile-card"><div className="profile-avatar">Z</div><div><h2>ZYX</h2><p>本地账号　·　数据只保存在此设备</p></div><button className="outline-button">切换账号</button></div><div className="settings-section"><div className="section-label">外观</div><div className="setting-row"><div><strong>主题</strong><span>选择 WHERE 的显示风格</span></div><div className="theme-switcher"><button className={theme === 'light' ? 'selected' : ''} onClick={() => setTheme('light')}>☼ 明亮</button><button className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')}>◐ 夜间</button></div></div></div><div className="settings-section"><div className="section-label">数据与安全</div><SettingRow icon="⌁" title="设备同步" description="在 PC 和手机之间安全同步" arrow /><SettingRow icon="↥" title="备份与恢复" description="导出或导入本地数据" arrow /><SettingRow icon="▤" title="历史记录" description="查看所有数据变更" arrow /></div><div className="settings-section"><div className="section-label">帮助</div><SettingRow icon="?" title="使用说明" description="了解 WHERE 的基本用法" arrow /><SettingRow icon="i" title="关于 WHERE" description="版本 0.3.0 · MIT License" arrow /></div></section></> }

function SettingRow({ icon, title, description, arrow }: { icon: string; title: string; description: string; arrow?: boolean }) { return <button className="setting-row setting-button"><span className="setting-icon">{icon}</span><span className="setting-copy"><strong>{title}</strong><span>{description}</span></span>{arrow && <span className="setting-arrow">›</span>}</button> }

export default App
