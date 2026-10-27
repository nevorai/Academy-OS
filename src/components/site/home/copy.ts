/**
 * Standard wording for each kind of academy. Plain statements of what coaching covers, nothing that
 * promises results or names a policy, so it is true for any academy that picks the niche.
 */
import type { Pack } from "./model";
import type { PillarIconKind } from "./art";

export type PillarCopy = {
  icon:
    | PillarIconKind
    | "lucide:dumbbell"
    | "lucide:heart"
    | "lucide:flame"
    | "lucide:book"
    | "lucide:pencil"
    | "lucide:target"
    | "lucide:message";
  title: string;
  body: string;
};

export type PackCopy = {
  label: string;
  pillarsTitle: string;
  pillarsLead: string;
  pillars: PillarCopy[];
  programsTitle: string;
  programsLead: string;
  who: string;
  /** Plain list of what to bring on the first day. Never promises kit the academy may not supply. */
  bring: string;
};

export const PACKS: Record<Pack, PackCopy> = {
  cricket: {
    label: "Cricket academy",
    pillarsTitle: "Four things every cricketer works on",
    pillarsLead:
      "Sessions are built around the skills that decide matches, taught in small groups with a coach watching each player.",
    pillars: [
      {
        icon: "bat",
        title: "Batting",
        body: "Grip, stance and footwork first. Then front-foot and back-foot play, shot selection and how to build an innings.",
      },
      {
        icon: "ball",
        title: "Bowling",
        body: "A clean action, line and length, and the variations that come once there is control. Pace and spin both get nets.",
      },
      {
        icon: "catch",
        title: "Fielding",
        body: "Catching, ground fielding and accurate throwing, practised until it is a habit, because the field wins matches too.",
      },
      {
        icon: "timer",
        title: "Fitness and mindset",
        body: "Strength, speed and stamina that suit a growing player, with the patience, focus and nerve that matches ask for.",
      },
    ],
    programsTitle: "Pick a batch, turn up and play",
    programsLead:
      "Training runs in fixed batches. Choose the timing that fits school and home, then register in a few minutes.",
    who: "players",
    bring:
      "Sports shoes, a water bottle, a cap and comfortable sports clothes. Ask the coach about bats, pads and kit before you buy any.",
  },
  gym: {
    label: "Gym",
    pillarsTitle: "What we help you build",
    pillarsLead:
      "A plan that fits your goal, a trainer who checks your form, and a place that is ready when you are.",
    pillars: [
      {
        icon: "lucide:dumbbell",
        title: "Strength",
        body: "Progressive training on proper equipment, with a trainer to correct form and keep the load sensible.",
      },
      {
        icon: "lucide:heart",
        title: "Cardio and stamina",
        body: "Conditioning work that lifts your endurance and your energy through the day.",
      },
      {
        icon: "lucide:flame",
        title: "Fat loss and shape",
        body: "Training and habits that move your body composition in the direction you want.",
      },
      {
        icon: "lucide:target",
        title: "Goals and tracking",
        body: "A clear target, regular check-ins and your attendance on record, so progress is visible.",
      },
    ],
    programsTitle: "Choose your slot",
    programsLead: "Pick the timing that suits your day, then join online in a few minutes.",
    who: "members",
    bring: "Training shoes, a towel, a water bottle and comfortable workout clothes.",
  },
  learning: {
    label: "Learning centre",
    pillarsTitle: "How learning is organised",
    pillarsLead:
      "Small groups, steady practice and regular feedback, so each learner knows where they stand.",
    pillars: [
      {
        icon: "lucide:book",
        title: "Concepts",
        body: "Topics taught step by step, so the idea is clear before the practice begins.",
      },
      {
        icon: "lucide:pencil",
        title: "Practice",
        body: "Regular exercises and homework that turn what was taught into something that sticks.",
      },
      {
        icon: "lucide:target",
        title: "Tests and review",
        body: "Short tests and a look at the mistakes, so gaps are found early.",
      },
      {
        icon: "lucide:message",
        title: "Questions answered",
        body: "Doubts are welcome in class, and parents can follow attendance and progress.",
      },
    ],
    programsTitle: "Choose a batch",
    programsLead: "Pick the timing that suits your day, then enrol online in a few minutes.",
    who: "learners",
    bring: "A notebook, a pen and a water bottle. The teacher will say if anything else is needed.",
  },
};

export type SessionStep = { title: string; body: string };

/** A typical cricket session, in order. Shown only on cricket academies. */
export const CRICKET_SESSION: SessionStep[] = [
  {
    title: "Warm-up and mobility",
    body: "Every session starts the same way: joints loosened, heart rate up, body ready.",
  },
  {
    title: "Skill drills",
    body: "Batting, bowling and fielding groups, with a coach working on one thing at a time.",
  },
  { title: "Net practice", body: "Time against real bowling, with feedback between overs." },
  {
    title: "Match situations",
    body: "Small games that ask for decisions under pressure, the way a match does.",
  },
  {
    title: "Cool-down and review",
    body: "Stretch, then a short talk on what went well and the one thing to fix next time.",
  },
];
