import { describe, expect, it } from 'vitest'
import { extractJson, mockPlan, mockSynthesis } from './agent'

describe('agent structured planning', () => {
  it('recognizes create, move and note requests in the mock provider', () => {
    expect(mockPlan('帮我删掉名称中包含钥匙的物品项')).toMatchObject({ intent: 'delete_items', itemNameContains: '钥匙' })
    expect(mockPlan('帮我删掉需要用电的物品项')).toMatchObject({ intent: 'delete_items', queryMode: 'semantic_category', category: 'needs_electricity' })
    expect(mockPlan('这几个都删掉', '用户：帮我删掉名称中包含钥匙的物品项\nWHERE AI：找到 3 个钥匙候选')).toMatchObject({ intent: 'delete_items', itemNameContains: '钥匙' })
    expect(mockPlan('帮我添加，我的作业本、学生证、充电宝都在书包里')).toMatchObject({ intent: 'create_items', items: [{ name: '作业本' }, { name: '学生证' }, { name: '充电宝' }] })
    expect(mockPlan('都添加', '用户：帮我添加，我的作业本、学生证、充电宝都在书包里')).toMatchObject({ intent: 'create_items' })
    expect(mockPlan('帮我记录：雨伞放在书柜架子上')).toMatchObject({ intent: 'create_item', name: '雨伞' })
    expect(mockPlan('帮我记录：雨伞放在书柜架子上').location).toContain('书柜')
    expect(mockPlan('电动车现在放在宿舍楼下')).toMatchObject({ intent: 'update_item', itemName: '电动车', newLocation: '宿舍楼下' })
    expect(mockPlan('给雨伞添加备注：黑色长柄')).toMatchObject({ intent: 'update_note', itemName: '雨伞', note: '黑色长柄' })
    expect(mockPlan('我的电动车停哪了？')).toMatchObject({ intent: 'query_items', queryMode: 'item_name', query: '电动车' })
    expect(mockPlan('我的床头柜里存放了哪些东西')).toMatchObject({ intent: 'query_items', queryMode: 'location_contains', locationContains: '床头柜' })
    expect(mockPlan('我的钱包里有什么')).toMatchObject({ intent: 'query_items', queryMode: 'location_contains', locationContains: '钱包' })
    expect(mockPlan('我的电子设备都放在哪里')).toMatchObject({ intent: 'query_items', queryMode: 'semantic_category', category: 'electronic_device' })
  })

  it('rejects unsupported model intents', () => {
    expect(() => extractJson('{"intent":"run_sql"}')).toThrow('不支持的意图')
  })

  it('summarizes container results without duplicating the container record', () => {
    const text = mockSynthesis(JSON.stringify({
      question: '我的钱包里有什么',
      plan: { intent: 'query_items', query: '钱包', queryMode: 'location_contains', locationContains: '钱包' },
      items: [
        { id: '1', name: '门钥匙', listId: 'placed', listName: '放在', location: '钱包', icon: '✦', updatedAt: 1 },
        { id: '2', name: '钱包', listId: 'stored', listName: '存有', location: '银行卡', icon: '✦', updatedAt: 1 },
        { id: '3', name: '银行卡', listId: 'placed', listName: '放在', location: '钱包', icon: '✦', updatedAt: 1 },
      ],
    }))
    expect(text).toBe('钱包里有：门钥匙、银行卡。')
  })

  it('includes appliances and power banks in needs-electricity synthesis', () => {
    const text = mockSynthesis(JSON.stringify({
      question: '删掉需要用电的物品',
      plan: { intent: 'delete_items', query: '需要用电', queryMode: 'semantic_category', category: 'needs_electricity' },
      items: [
        { id: '1', name: '吹风机', listId: 'placed', listName: '放在', location: '浴室', icon: '✦', updatedAt: 1 },
        { id: '2', name: '充电宝', listId: 'placed', listName: '放在', location: '床头柜', icon: '✦', updatedAt: 1 },
        { id: '3', name: '身份证', listId: 'placed', listName: '放在', location: '钱包', icon: '✦', updatedAt: 1 },
      ],
    }))
    expect(text).toContain('吹风机')
    expect(text).toContain('充电宝')
    expect(text).not.toContain('身份证')
  })
})
