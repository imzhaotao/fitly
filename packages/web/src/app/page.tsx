import Link from 'next/link';
import { Suspense } from 'react';
import { db } from '@/lib/supabase';
import { readWorkspace } from '@/lib/workspace';
import { TEMPLATES } from '@/plan/templates';
import { TemplateButton } from './TemplateButton';

export const dynamic = 'force-dynamic';

/** 示例户型图（scripts/gen-sample-plans.py 生成的原创布局） */
const SAMPLES = [
  { id: 'a', name: '一室一厅', area: '约 48㎡' },
  { id: 'b', name: '两室一厅', area: '约 76㎡' },
  { id: 'c', name: '三室两厅', area: '约 108㎡' },
];

async function myPlans() {
  const ws = await readWorkspace();
  if (!ws) return [];
  const { data } = await db()
    .from('plans')
    .select('id, name, updated_at')
    .eq('workspace_id', ws)
    .order('updated_at', { ascending: false })
    .limit(10);
  return data ?? [];
}

/** 模板卡片上的示意小图：左侧客餐厅，右侧厨房与卧室 */
function Thumb({ id }: { id: string }) {
  return (
    <div className="relative h-[150px] overflow-hidden rounded-[10px] bg-[#e9e2d6]">
      <div className="absolute inset-y-0 left-[54%] w-px bg-[#d9d0c2]" />
      <div className="absolute left-[54%] right-0 top-1/2 h-px bg-[#d9d0c2]" />
      {id === 'kids' ? (
        <>
          <div className="absolute left-[10%] top-1/2 h-[38%] w-[12%] rounded-md bg-[#8a9a8c]" />
          <div className="absolute left-[30%] top-[48%] h-[40%] w-[22%] rounded-xl bg-[#9fb0a3]" />
        </>
      ) : (
        <>
          <div className="absolute left-[10%] top-[45%] h-[45%] w-[14%] rounded-md bg-[#c9bba8]" />
          <div className="absolute left-[24%] top-[72%] h-[18%] w-[9%] rounded-md bg-[#c9bba8]" />
          <div className="absolute left-[50%] top-1/2 h-[35%] w-[4%] rounded-md bg-[#a67c52]" />
        </>
      )}
    </div>
  );
}

async function MyPlans() {
  const plans = await myPlans().catch(() => []);
  if (plans.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 mt-7 text-[17px] font-semibold">我的方案</h2>
      <ul className="m-0 list-none divide-y divide-line rounded-xl bg-panel p-0">
        {plans.map((p) => (
          <li key={p.id} className="flex justify-between gap-3 px-3.5 py-3">
            <Link href={`/plan/${p.id}`}>{p.name}</Link>
            <span className="text-xs text-muted">{new Date(p.updated_at).toLocaleString('zh-CN', { hour12: false })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Home() {
  return (
    <div className="mx-auto max-w-[980px] px-4 pb-12 pt-5">
      <header className="flex items-center justify-between">
        <span className="text-lg font-extrabold tracking-wide">Fitly</span>
      </header>

      <section className="pb-5 pt-9">
        <h1 className="mb-3 mt-0 text-[clamp(26px,5vw,40px)] font-bold tracking-tight">买之前，先在你家 3D 试一下</h1>
        <p className="m-0 max-w-[620px] text-[15px] text-muted">
          上传你家的户型图，或选一套设计模板改成自家尺寸，拖动沙发、床、冰箱试摆。 挡门、挡插座、过道太窄这些坑，会在你摆的那一刻按你家尺寸算出来。
        </p>
      </section>

      <section>
        <h2 className="mb-3 mt-7 text-[17px] font-semibold">用你家的户型图开始</h2>
        <Link
          href="/trace"
          className="flex items-center gap-3 rounded-2xl bg-ink p-4 text-white no-underline shadow-card"
        >
          <span className="text-3xl">📐</span>
          <span className="flex-1">
            <strong className="block">上传户型图，自动识别墙和房间</strong>
            <span className="text-[13px] text-white/70">售楼处、中介给的平面图都可以。自动读尺寸、识别墙和房间名，几分钟生成你家的 3D 户型；图片只在你的浏览器里处理。</span>
          </span>
          <span className="text-white/70">›</span>
        </Link>
        <div className="mt-3">
          <span className="text-xs text-muted">手边没有户型图？点一张示例看看效果：</span>
          <div className="mt-2 grid grid-cols-3 gap-2.5">
            {SAMPLES.map((x) => (
              <Link key={x.id} href={`/trace?sample=${x.id}`} className="overflow-hidden rounded-xl bg-panel no-underline shadow-card transition-opacity active:opacity-60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/samples/plan-${x.id}-thumb.jpg`} alt={x.name} className="block aspect-square w-full object-cover" loading="lazy" />
                <span className="block px-2 py-1.5 text-[13px]">
                  {x.name}
                  <span className="ml-1 text-xs text-muted">{x.area}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 mt-7 text-[17px] font-semibold">没有户型图？从一套设计模板开始</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {TEMPLATES.filter((t) => !t.hidden).map((t) => (
            <div key={t.id} className="flex flex-col gap-2 rounded-2xl bg-panel p-3.5 shadow-card">
              <Thumb id={t.id} />
              <h3 className="mb-0 mt-1 text-base font-semibold">{t.name}</h3>
              <p className="m-0 text-[13px] text-muted">{t.summary}</p>
              <div className="flex flex-wrap gap-1.5">
                {t.tags.map((x) => (
                  <span key={x} className="rounded-full bg-soft-2 px-[7px] py-px text-[11px] text-muted">
                    {x}
                  </span>
                ))}
              </div>
              <div className="mt-auto">
                <TemplateButton templateId={t.id} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">户型：客餐厅 + 厨房 + 卧室，开间、进深都能改；墙上的插座、燃气点位可以改成你家实测的高度。</p>
      </section>


      {/* “我的方案”要查数据库，单独流式加载，不挡住页面其他部分 */}
      <Suspense fallback={<div className="mt-7 h-[120px] animate-pulse rounded-xl bg-soft-2" />}>
        <MyPlans />
      </Suspense>

      <footer className="mt-10 text-xs text-muted">
        Fitly 只做软装与家具布局试装。涉及水电、燃气、防水的提醒只给检查项和提问清单，实际施工以现场师傅、物业或燃气公司确认为准。
      </footer>
    </div>
  );
}
