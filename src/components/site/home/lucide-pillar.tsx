import {
  BookOpen,
  Dumbbell,
  Flame,
  HeartPulse,
  MessageCircle,
  Pencil,
  Target,
  type LucideProps,
} from "lucide-react";

const ICONS = {
  dumbbell: Dumbbell,
  heart: HeartPulse,
  flame: Flame,
  book: BookOpen,
  pencil: Pencil,
  target: Target,
  message: MessageCircle,
} as const;

/** The few line icons the gym and learning wording uses (cricket has its own artwork). */
export function Lucide({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name as keyof typeof ICONS] ?? Target;
  return <Icon aria-hidden="true" {...props} />;
}
