/** 首页骨架屏：点 Logo 回首页时立即出现，等“我的方案”查完再替换 */
export default function Loading() {
  const block = 'animate-pulse rounded-xl bg-soft-2';
  return (
    <div className="mx-auto max-w-[980px] px-4 pb-12 pt-5" role="status" aria-label="正在加载首页">
      <span className="text-lg font-extrabold tracking-wide">Fitly</span>
      <div className="pb-5 pt-9">
        <div className={`${block} mb-3 h-10 w-3/4 max-w-[520px]`} />
        <div className={`${block} h-4 w-full max-w-[620px]`} />
        <div className={`${block} mt-2 h-4 w-2/3 max-w-[420px]`} />
      </div>
      <div className={`${block} mt-7 h-[76px] w-full`} />
      <div className="mt-7 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        <div className={`${block} h-[300px]`} />
        <div className={`${block} h-[300px]`} />
      </div>
    </div>
  );
}
