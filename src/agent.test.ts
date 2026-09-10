import { describe, expect, it } from 'vitest'
import { extractJson, mockPlan, mockSynthesis } from './agent'
import { cosineSimilarity } from './vector-match'

describe('agent composable tool planning', () => {
  it('plans a compound request using generic search, update, delete and create tools', () => {
    const plan = mockPlan('把第二个抽屉里的东西都放到床头的储物箱中，删除钱包里的银行卡，便携手电筒放在钱包里')
    expect(plan.steps.map((step) => step.tool)).toEqual(['search_items', 'update_item', 'search_items', 'delete_item', 'create_item'])
    expect(plan.steps[1].forEach).toBe('find-drawer.items')
    expect(plan.steps[3].forEach).toBe('find-card.items')
  })

  it('plans a name-based move without a special move tool', () => {
    const plan = extractJson(JSON.stringify({
      goal: '把充电宝移动到书桌抽屉',
      steps: [
        { id: 'find', tool: 'search_items', purpose: '按名称找到充电宝', args: { name: '充电宝' } },
        { id: 'move', tool: 'update_item', purpose: '更新位置', forEach: 'find.items', args: { item_id: '$item.id', location: '书桌抽屉' } },
      ],
    }))
    expect(plan.steps[1].tool).toBe('update_item')
    expect(plan.steps[1].forEach).toBe('find.items')
  })

  it('uses an all-items search for inventory questions', () => {
    const plan = mockPlan('我目前一共有哪些物品')
    expect(plan.steps[0]).toMatchObject({ tool: 'search_items', args: { scope: 'all' } })
  })

  it('uses semantic candidate selection for needs-electricity queries', () => {
    const plan = mockPlan('帮我删掉需要用电的物品项')
    expect(plan.steps[0]).toMatchObject({ tool: 'search_items', args: { semantic_query: '需要用电' } })
  })

  it('rejects unregistered tools', () => {
    expect(() => extractJson(JSON.stringify({ goal: '越权', steps: [{ id: 'bad', tool: 'run_sql', purpose: '越权' }] }))).toThrow('未注册工具')
    expect(() => extractJson(JSON.stringify({ goal: '错误引用', steps: [{ id: 'update', tool: 'update_item', purpose: '错误引用', forEach: 'missing.items' }] }))).toThrow('不存在的步骤')
  })

  it('deduplicates container records in the mock synthesis', () => {
    const text = mockSynthesis(JSON.stringify({
      plan: { query: '钱包', queryMode: 'location_contains' },
      items: [
        { id: '1', name: '门钥匙', listId: 'placed', listName: '放在', location: '钱包', icon: '✦', updatedAt: 1 },
        { id: '2', name: '钱包', listId: 'stored', listName: '存有', location: '银行卡', icon: '✦', updatedAt: 1 },
        { id: '3', name: '银行卡', listId: 'placed', listName: '放在', location: '钱包', icon: '✦', updatedAt: 1 },
      ],
    }))
    expect(text).toBe('钱包里有：门钥匙、银行卡。')
  })

  it('matches natural location variants through cosine similarity', () => {
    expect(cosineSimilarity('床头柜第一个抽屉', '床头柜的第一个抽屉')).toBeGreaterThan(0.7)
    expect(cosineSimilarity('床头柜第一个抽屉', '客厅窗边')).toBeLessThan(0.5)
  })
})
