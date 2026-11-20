export function getTimeGreeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return '早上好，想写点什么？'
  if (hour >= 12 && hour < 18) return '中午好，有什么新鲜事吗？'
  return '晚上好，想写点什么？'
}
