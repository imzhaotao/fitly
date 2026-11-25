import type { Metadata } from 'next';
import Tracer from '@/trace/Tracer';

export const metadata: Metadata = {
  title: 'Fitly · 上传户型图',
  description: '上传户型图，定比例、点一下墙，自动生成可以摆家具的 3D 户型。',
};

export default function TracePage() {
  return <Tracer />;
}
