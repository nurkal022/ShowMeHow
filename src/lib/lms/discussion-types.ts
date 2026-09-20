/** Сообщение обсуждения под уроком. Тип отдельно от запросов: его импортирует и клиент. */
export interface Comment {
  id: string; authorId: string; author: string; role: 'teacher' | 'student';
  body: string; createdAt: string; parentId: string | null; deleted: boolean;
}
