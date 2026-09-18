import CourseTabs from '@/components/cabinet/CourseTabs';

/** Вкладки курса над каждой его страницей. Доступ проверяют сами страницы (чужому — 404). */
export default async function CourseLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="cab-course">
      <CourseTabs courseId={id} />
      {children}
    </div>
  );
}
