import { describe, expect, it } from 'vitest'
import { extractJson, mockPlan } from './agent'

describe('agent structured planning', () => {
  it('recognizes create, move and note requests in the mock provider', () => {
    expect(mockPlan('帮我记录：雨伞放在书柜架子上')).toMatchObject({ intent: 'create_item', name: '雨伞' })
    expect(mockPlan('帮我记录：雨伞放在书柜架子上').location).toContain('书柜')
    expect(mockPlan('电动车现在放在宿舍楼下')).toMatchObject({ intent: 'update_item', itemName: '电动车', newLocation: '宿舍楼下' })
    expect(mockPlan('给雨伞添加备注：黑色长柄')).toMatchObject({ intent: 'update_note', itemName: '雨伞', note: '黑色长柄' })
    expect(mockPlan('我的电动车停哪了？')).toMatchObject({ intent: 'query_items', queryMode: 'item_name', query: '电动车' })
    expect(mockPlan('我的床头柜里存放了哪些东西')).toMatchObject({ intent: 'query_items', queryMode: 'location_contains', locationContains: '床头柜' })
    expect(mockPlan('我的电子设备都放在哪里')).toMatchObject({ intent: 'query_items', queryMode: 'semantic_category', category: 'electronic_device' })
  })

  it('rejects unsupported model intents', () => {
    expect(() => extractJson('{"intent":"run_sql"}')).toThrow('不支持的意图')
  })
})
