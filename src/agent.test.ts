import { describe, expect, it } from 'vitest'
import { extractJson, mockPlan } from './agent'

describe('agent structured planning', () => {
  it('recognizes create, move and note requests in the mock provider', () => {
    expect(mockPlan('帮我记录：雨伞放在书柜架子上')).toMatchObject({ intent: 'create_item', name: '雨伞', location: '书柜架子上' })
    expect(mockPlan('电动车现在放在宿舍楼下')).toMatchObject({ intent: 'update_item', itemName: '电动车', newLocation: '宿舍楼下' })
    expect(mockPlan('给雨伞添加备注：黑色长柄')).toMatchObject({ intent: 'update_note', itemName: '雨伞', note: '黑色长柄' })
  })

  it('rejects unsupported model intents', () => {
    expect(() => extractJson('{"intent":"run_sql"}')).toThrow('不支持的意图')
  })
})
