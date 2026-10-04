import { useEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { fetchCoverPhotoUrls } from "@/lib/home-query";
import { readEmbeddedName } from "@/lib/place-categories";
import logo from "@/assets/lakbay-pasig-logo.svg";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategoryNames, type CategoryItem, type CategoryNames } from "@/components/category-chip-group";
import { cn } from "@/lib/utils";

/**
 * Recommendation onboarding as a short, motion-led flow: welcome, places,
 * businesses, then a payoff beat that irises closed onto Home. Eligibility and
 * writes are unchanged: a resident with no categories and no `onboarding_done`
 * flag, once per account per page load; Done and Skip both set the flag.
 * It can also be reopened on purpose (PersonalizePrompt on Home, for people
 * who skipped) through the PERSONALIZE_EVENT below.
 *
 * Following the app-feel video:
 *  - Anticipate: greets by name, says it is short, flags the categories that
 *    have the most to explore.
 *  - Know when not to animate: the picking screens are calm (no looping shapes,
 *    no pulsing arrows). Idle motion lives only on the welcome and finish
 *    screens. The finish waits on the real save, not on a timer.
 *  - Consistency: tiles use the same category icon and color as Profile and
 *    the Discover legend whenever a category has no photo.
 *  - Prescriptive errors, no dead ends, and one small reward: a postcard.
 * All motion is off or instant under reduced motion.
 */

export const PERSONALIZE_EVENT = "lakbay:personalize";

type Step = "welcome" | "places" | "businesses" | "finishing";
const PROGRESS_STEPS: Step[] = ["welcome", "places", "businesses"];
const BG = "color-mix(in srgb, hsl(var(--primary)) 7%, hsl(var(--background)))";
const SAVED_BEAT_MS = 800;
const SPRING = { type: "spring", stiffness: 260, damping: 22 } as const;

type Covers = Map<string, string>;
type Counts = Map<string, number>;

// One cover photo per category (from the first place/business in it with one)
// and a listing count per category. Any failure just means color tiles and no
// badges, so this never blocks or errors.
async function loadCovers(): Promise<{ covers: Covers; counts: Counts; samples: string[] }> {
  const covers: Covers = new Map();
  const counts: Counts = new Map();
  const bucket = { place: [] as string[], business: [] as string[] };
  type Row = { id: string; [embed: string]: unknown };
  const kinds = [
    { kind: "place", table: "places", embed: "place_categories", photos: "place_photos", col: "place_id" },
    { kind: "business", table: "businesses", embed: "business_categories", photos: "business_photos", col: "business_id" },
  ] as const;
  await Promise.all(
    kinds.map(async ({ kind, table, embed, photos, col }) => {
      try {
        const { data } = await supabase.from(table).select(`id, ${embed}(name)`).limit(400);
        const rows = (data ?? []) as unknown as Row[];
        const urls = await fetchCoverPhotoUrls(photos, col, rows.map((r) => r.id));
        for (const row of rows) {
          const name = readEmbeddedName(row[embed] as { name: string } | { name: string }[] | null);
          if (!name) continue;
          const key = `${kind}:${name}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          const url = urls.get(row.id);
          if (url && !covers.has(key)) covers.set(key, url);
          if (url && bucket[kind].length < 3 && !bucket[kind].includes(url)) bucket[kind].push(url);
        }
      } catch {
        /* color tiles */
      }
    })
  );
  return { covers, counts, samples: [...bucket.place, ...bucket.business].slice(0, 3) };
}

export function CategoriesOnboarding() {
  const { session, profile, loading } = useAuth();
  const [pendingFor, setPendingFor] = useState<string | null>(null);
  const checkedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !session || !profile) return;
    const userId = session.user.id;
    if (checkedFor.current === userId) return;
    checkedFor.current = userId;

    if (profile.staff_role) return;
    if (session.user.user_metadata?.onboarding_done === true) return;
    if ((profile.preferred_categories?.length ?? 0) > 0) return;
    setPendingFor(userId);
  }, [loading, session, profile]);

  // Reopened on purpose from Home. Skips the first-visit checks above.
  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;
    const reopen = () => setPendingFor(userId);
    window.addEventListener(PERSONALIZE_EVENT, reopen);
    return () => window.removeEventListener(PERSONALIZE_EVENT, reopen);
  }, [session]);

  if (!session || pendingFor !== session.user.id) return null;
  return <OnboardingFlow userId={session.user.id} onDone={() => setPendingFor(null)} />;
}

/**
 * Home card for a signed in resident who skipped: a stepping stone back to the
 * picker instead of a Home with nothing personal on it.
 */
export function PersonalizePrompt() {
  const { session, profile } = useAuth();
  if (!session || !profile || profile.staff_role) return null;
  if ((profile.preferred_categories?.length ?? 0) > 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Make Home yours</h2>
        <p className="text-sm text-muted-foreground">Tell us what you like and we&apos;ll show it first.</p>
      </div>
      <Button onClick={() => window.dispatchEvent(new Event(PERSONALIZE_EVENT))}>Choose categories</Button>
    </div>
  );
}

type Pick = { name: string; color: string; Icon?: CategoryItem["Icon"]; cover?: string };

function PickFace({ pick, iconClass }: Readonly<{ pick: Pick; iconClass: string }>) {
  if (pick.cover) return <img src={pick.cover} alt="" className="h-full w-full object-cover" />;
  if (pick.Icon) return <pick.Icon className={iconClass} />;
  return <span>{pick.name.charAt(0).toUpperCase()}</span>;
}

function OnboardingFlow({ userId, onDone }: Readonly<{ userId: string; onDone: () => void }>) {
  const { profile, refreshProfile } = useAuth();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("welcome");
  const [dir, setDir] = useState<1 | -1>(1);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { placeList, businessList } = useCategoryNames(true, attempt);
  const [data, setData] = useState<{ covers: Covers; counts: Counts; samples: string[] }>({ covers: new Map(), counts: new Map(), samples: [] });

  useEffect(() => {
    let cancelled = false;
    loadCovers().then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const { covers, counts } = data;
  const firstName = (profile?.display_name ?? "").trim().split(/\s+/)[0];
  const count = chosen.length;

  function go(next: Step, d: 1 | -1) {
    setDir(d);
    setStep(next);
  }

  function toggle(name: string) {
    setChosen((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  }

  const picks: Pick[] = chosen.map((name) => {
    const place = placeList.status === "ready" ? placeList.items.find((i) => i.name === name) : undefined;
    const biz = businessList.status === "ready" ? businessList.items.find((i) => i.name === name) : undefined;
    const item = place ?? biz;
    return { name, color: item?.color ?? "hsl(var(--primary))", Icon: item?.Icon, cover: covers.get(`${place ? "place" : "business"}:${name}`) };
  });

  // Click handlers only, never onAuthStateChange (auth-context.tsx). A failed
  // flag write just means the flow is offered once more next load.
  async function markDone() {
    await supabase.auth.updateUser({ data: { onboarding_done: true } });
  }

  async function handleSkip() {
    if (busy) return;
    setBusy(true);
    await markDone();
    setLeaving(true);
  }

  async function handleFinish() {
    if (busy || count === 0) return;
    setBusy(true);
    setError(null);
    go("finishing", 1);

    const { error: saveError } = await supabase.from("profiles").update({ preferred_categories: chosen }).eq("id", userId);

    if (saveError) {
      setBusy(false);
      go("businesses", -1);
      setError("We couldn't save your picks. Check your connection and try again, or skip and choose them later in Profile.");
      return;
    }

    // Waits only on the real work. The short beat after it is there so the
    // "Saved" state can be seen before the iris closes.
    await Promise.all([markDone(), refreshProfile()]);
    setSaved(true);
    await new Promise((r) => setTimeout(r, reduceMotion ? 200 : SAVED_BEAT_MS));
    setLeaving(true);
  }

  const stepIndex = PROGRESS_STEPS.indexOf(step);
  const sample = data.samples;
  const fallback = placeList.status === "ready" ? placeList.items.slice(0, 3) : [];

  let screen: ReactNode;
  if (step === "welcome") {
    screen = (
      <Screen key="welcome" dir={dir} reduceMotion={reduceMotion}>
        <div className="flex flex-1 flex-col items-center justify-center gap-12 text-center">
          <WelcomeCards sample={sample} fallback={fallback} reduceMotion={reduceMotion} />
          <div className="flex flex-col gap-3">
            <DialogPrimitive.Title className="text-3xl font-semibold tracking-tight sm:text-4xl text-foreground">
              <Words text={firstName ? `Welcome, ${firstName}!` : "Welcome!"} reduceMotion={reduceMotion} delay={0.45} />
            </DialogPrimitive.Title>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: 0.8 }}
            >
              <DialogPrimitive.Description className="mx-auto max-w-sm text-balance text-base text-muted-foreground">
                Pick what you like and we&apos;ll set up your Home. It takes under a minute.
              </DialogPrimitive.Description>
            </motion.div>
          </div>
        </div>
      </Screen>
    );
  } else if (step === "finishing") {
    screen = (
      <Screen key="finishing" dir={dir} reduceMotion={reduceMotion}>
        <FinishScreen picks={picks} saved={saved} reduceMotion={reduceMotion} />
      </Screen>
    );
  } else {
    const isPlaces = step === "places";
    screen = (
      <Screen key={step} dir={dir} reduceMotion={reduceMotion}>
        <div className="flex flex-col gap-2">
          <DialogPrimitive.Title className="text-3xl font-semibold tracking-tight sm:text-4xl text-foreground">
            <Words text={isPlaces ? "What do you want to find in Pasig?" : "Which local businesses interest you?"} reduceMotion={reduceMotion} />
          </DialogPrimitive.Title>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.35 }}
          >
            <DialogPrimitive.Description className="text-base text-muted-foreground">
              Pick as many as you like. You can change this anytime in Profile.
            </DialogPrimitive.Description>
          </motion.div>
        </div>
        <PhotoTiles
          list={isPlaces ? placeList : businessList}
          kind={isPlaces ? "place" : "business"}
          covers={covers}
          counts={counts}
          selected={chosen}
          onToggle={toggle}
          onRetry={() => setAttempt((a) => a + 1)}
          reduceMotion={reduceMotion}
        />
      </Screen>
    );
  }

  let status = "";
  if (step === "places") status = count === 0 ? "Nothing picked yet." : "picked";
  if (step === "businesses") status = count === 0 ? "Pick at least one to continue." : "picked";
  if (error) status = error;
  const showCount = count > 0 && !error && (step === "places" || step === "businesses");

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content onEscapeKeyDown={(e) => e.preventDefault()} className="fixed inset-0 z-50 outline-none">
          {/* The iris: the whole screen shrinks to a point, revealing Home. */}
          <motion.div
            className="relative flex h-full flex-col overflow-hidden"
            style={{ backgroundColor: BG }}
            initial={false}
            animate={{ clipPath: leaving ? "circle(0% at 50% 55%)" : "circle(150% at 50% 55%)" }}
            transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.7, 0, 0.3, 1] }}
            onAnimationComplete={() => {
              if (leaving) onDone();
            }}
          >
            <Scene step={step} reduceMotion={reduceMotion} />

            <header className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 pt-4">
              {stepIndex >= 0 && (
                <div className="flex gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={stepIndex + 1}>
                  {PROGRESS_STEPS.map((s, i) => (
                    <span key={s} className="h-1 flex-1 overflow-hidden rounded-lg bg-border">
                      <motion.span
                        className="block h-full origin-left bg-primary"
                        initial={false}
                        animate={{ scaleX: i <= stepIndex ? 1 : 0 }}
                        transition={{ ...SPRING, stiffness: 140 }}
                      />
                    </span>
                  ))}
                </div>
              )}
              <div className="flex h-10 items-center justify-between">
                {step === "places" || step === "businesses" ? (
                  <Button variant="ghost" onClick={() => go(step === "places" ? "welcome" : "places", -1)} disabled={busy}>
                    <ArrowLeft weight="bold" className="mr-1 h-4 w-4" aria-hidden="true" />
                    Back
                  </Button>
                ) : (
                  <motion.img
                    src={logo}
                    alt="Lakbay Pasig"
                    className="h-8 w-8"
                    initial={reduceMotion ? false : { rotate: -90, scale: 0 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 14 }}
                  />
                )}
                {step !== "finishing" && (
                  <Button variant="ghost" onClick={handleSkip} disabled={busy}>
                    Skip setup
                  </Button>
                )}
              </div>
            </header>

            <div className="relative z-10 flex-1 overflow-y-auto">
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-8 px-6 py-6">
                <AnimatePresence mode="wait" initial={false} custom={dir}>
                  {screen}
                </AnimatePresence>
              </div>
            </div>

            {step !== "finishing" && (
              <footer className="relative z-10 bg-background">
                <div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center", step === "welcome" ? "sm:justify-center" : "sm:justify-between")}>
                  <div className={cn("flex min-h-9 items-center justify-center gap-3 sm:justify-start", step === "welcome" && "hidden")}>
                    <Tray picks={picks} reduceMotion={reduceMotion} />
                    <p aria-live="polite" className={cn("flex items-center gap-1.5 text-sm", error ? "text-destructive" : "text-muted-foreground")}>
                      {showCount && (
                        <span className="relative inline-flex h-5 min-w-[1ch] overflow-hidden font-semibold text-foreground">
                          <AnimatePresence mode="popLayout" initial={false}>
                            <motion.span
                              key={count}
                              initial={{ y: 16, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              exit={{ y: -16, opacity: 0 }}
                              transition={{ duration: reduceMotion ? 0 : 0.18 }}
                            >
                              {count}
                            </motion.span>
                          </AnimatePresence>
                        </span>
                      )}
                      <span>{status}</span>
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="h-11 w-full sm:h-9 sm:w-auto"
                    onClick={step === "welcome" ? () => go("places", 1) : step === "places" ? () => go("businesses", 1) : handleFinish}
                    disabled={step === "businesses" && (busy || count === 0)}
                  >
                    {step === "welcome" && "Let's go"}
                    {step === "places" && "Next"}
                    {step === "businesses" && "Go to Home"}
                    {step !== "businesses" && <ArrowRight weight="bold" className="ml-2 h-4 w-4" aria-hidden="true" />}
                  </Button>
                </div>
              </footer>
            )}
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// A scene of flat shapes (no gradients, no glow) that glides to a new
// composition on each step. It only drifts idly on welcome and finish; on the
// picking screens it holds still so nothing competes with the tiles.
const SCENE: Record<Step, { x: string; y: string; s: number }[]> = {
  welcome: [{ x: "-20vw", y: "-25vh", s: 1 }, { x: "45vw", y: "10vh", s: 1.2 }, { x: "5vw", y: "55vh", s: 0.8 }],
  places: [{ x: "55vw", y: "-30vh", s: 0.8 }, { x: "-30vw", y: "30vh", s: 1.1 }, { x: "40vw", y: "60vh", s: 1 }],
  businesses: [{ x: "-10vw", y: "50vh", s: 1.2 }, { x: "60vw", y: "-10vh", s: 0.9 }, { x: "20vw", y: "-35vh", s: 0.7 }],
  finishing: [{ x: "20vw", y: "10vh", s: 2.4 }, { x: "30vw", y: "20vh", s: 1.7 }, { x: "36vw", y: "26vh", s: 1 }],
};
const SCENE_TINTS = [16, 26, 11];

function Scene({ step, reduceMotion }: Readonly<{ step: Step; reduceMotion: boolean | null }>) {
  const idle = !reduceMotion && (step === "welcome" || step === "finishing");
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {SCENE[step].map((pos, i) => (
        <motion.div
          key={i}
          className="absolute left-0 top-0"
          initial={false}
          animate={{ x: pos.x, y: pos.y, scale: pos.s }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 36, damping: 18, mass: 1.2 }}
        >
          <motion.div
            className="h-[42vmin] w-[42vmin] rounded-full"
            style={{ backgroundColor: `color-mix(in srgb, hsl(var(--primary)) ${SCENE_TINTS[i]}%, hsl(var(--background)))` }}
            animate={idle ? { y: [0, -18, 0], x: [0, 10, 0] } : { y: 0, x: 0 }}
            transition={idle ? { duration: 7 + i * 2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.6 }}
          />
        </motion.div>
      ))}
    </div>
  );
}

const screenVariants = {
  enter: (d: number) => ({ opacity: 0, x: d * 48 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -48 }),
};

function Screen({ children, dir, reduceMotion }: Readonly<{ children: ReactNode; dir: number; reduceMotion: boolean | null }>) {
  return (
    <motion.div
      custom={dir}
      variants={screenVariants}
      initial={reduceMotion ? false : "enter"}
      animate="center"
      exit={reduceMotion ? undefined : "exit"}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-1 flex-col gap-8"
    >
      {children}
    </motion.div>
  );
}

// Title that rises into place word by word from behind a mask.
function Words({ text, reduceMotion, delay = 0.05 }: Readonly<{ text: string; reduceMotion: boolean | null; delay?: number }>) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <span key={`${word}-${i}`} className="mr-[0.25em] inline-block overflow-hidden pb-1 align-bottom">
          <motion.span
            className="inline-block"
            initial={reduceMotion ? false : { y: "110%", rotate: 4 }}
            animate={{ y: 0, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22, delay: delay + i * 0.06 }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </>
  );
}

// Three photo cards: spring in, float, drift with the pointer at three depths.
function WelcomeCards({ sample, fallback, reduceMotion }: Readonly<{ sample: string[]; fallback: CategoryItem[]; reduceMotion: boolean | null }>) {
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 80, damping: 18 });
  const sy = useSpring(py, { stiffness: 80, damping: 18 });

  useEffect(() => {
    if (reduceMotion) return;
    function onMove(e: PointerEvent) {
      px.set(e.clientX / window.innerWidth - 0.5);
      py.set(e.clientY / window.innerHeight - 0.5);
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [px, py, reduceMotion]);

  return (
    <div className="flex items-end justify-center -space-x-6 sm:space-x-0 sm:gap-3" aria-hidden="true">
      {[-7, 0, 7].map((rotate, i) => (
        <FloatCard key={rotate} index={i} rotate={rotate} photo={sample[i]} fallback={fallback[i]} sx={sx} sy={sy} reduceMotion={reduceMotion} />
      ))}
    </div>
  );
}

function FloatCard({
  index,
  rotate,
  photo,
  fallback,
  sx,
  sy,
  reduceMotion,
}: Readonly<{
  index: number;
  rotate: number;
  photo: string | undefined;
  fallback: CategoryItem | undefined;
  sx: ReturnType<typeof useSpring>;
  sy: ReturnType<typeof useSpring>;
  reduceMotion: boolean | null;
}>) {
  const depth = 14 + index * 12;
  const x = useTransform(sx, [-0.5, 0.5], [-depth, depth]);
  const y = useTransform(sy, [-0.5, 0.5], [-depth / 2, depth / 2]);
  return (
    <motion.div style={{ x, y }}>
      <motion.div
        animate={reduceMotion ? undefined : { y: [0, index === 1 ? -14 : -8, 0] }}
        transition={{ duration: 4 + index * 0.9, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 80, rotate: 0, scale: 0.8 }}
          animate={{ opacity: 1, y: index === 1 ? -12 : 0, rotate, scale: 1 }}
          transition={{ type: "spring", stiffness: 130, damping: 14, delay: 0.1 + index * 0.12 }}
          className="flex h-44 w-32 items-center justify-center overflow-hidden rounded-2xl border-4 border-background sm:h-56 sm:w-40 lg:h-64 lg:w-48"
          style={{ backgroundColor: `color-mix(in srgb, hsl(var(--primary)) ${22 + index * 14}%, hsl(var(--background)))` }}
        >
          {photo ? (
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            fallback && <fallback.Icon className="h-14 w-14" style={{ color: fallback.color }} />
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// The payoff. A postcard of one of the person's picks drops in while the save
// finishes (the reward discovery from the video); the state line is true: it
// says "Saving" until the save lands, then "Saved".
function FinishScreen({ picks, saved, reduceMotion }: Readonly<{ picks: Pick[]; saved: boolean; reduceMotion: boolean | null }>) {
  const card = picks.find((p) => p.cover) ?? picks[0];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      {card && (
        <motion.div
          aria-hidden="true"
          initial={reduceMotion ? false : { y: 160, opacity: 0, rotate: 12 }}
          animate={{ y: 0, opacity: 1, rotate: -4 }}
          transition={{ type: "spring", stiffness: 120, damping: 14 }}
          className="relative w-64 overflow-hidden rounded-2xl border-4 border-background bg-card"
        >
          <div
            className="flex h-40 items-center justify-center overflow-hidden"
            style={{ backgroundColor: `color-mix(in srgb, ${card.color} 24%, hsl(var(--background)))`, color: card.color }}
          >
            <PickFace pick={card} iconClass="h-14 w-14" />
          </div>
          <p className="px-3 py-2.5 text-left text-sm font-semibold text-foreground">Greetings from Pasig</p>
          <motion.span
            initial={reduceMotion ? false : { scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 6 }}
            transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.6 }}
            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg bg-background"
          >
            <img src={logo} alt="" className="h-8 w-8" />
          </motion.span>
        </motion.div>
      )}
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <AnimatePresence mode="wait" initial={false}>
            {saved ? (
              <motion.span
                key="saved"
                initial={reduceMotion ? false : { scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 12 }}
              >
                <Check weight="bold" className="h-7 w-7" aria-hidden="true" />
              </motion.span>
            ) : (
              <motion.span
                key="saving"
                className="block h-5 w-5 rounded-lg border-2 border-primary-foreground"
                animate={reduceMotion ? undefined : { rotate: 180 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </AnimatePresence>
        </span>
        <DialogPrimitive.Title className="text-3xl font-semibold tracking-tight sm:text-4xl text-foreground">
          <Words text={saved ? "You're all set" : "Setting up your Home"} reduceMotion={reduceMotion} />
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="text-base text-muted-foreground" aria-live="polite">
          {saved ? "Saved. Taking you to Home." : "Saving your picks."}
        </DialogPrimitive.Description>
      </div>
    </div>
  );
}

// Your picks, as small tiles that pop in beside the counter.
function Tray({ picks, reduceMotion }: Readonly<{ picks: Pick[]; reduceMotion: boolean | null }>) {
  const shown = picks.slice(-5);
  return (
    <div className="flex -space-x-2" aria-hidden="true">
      <AnimatePresence initial={false}>
        {shown.map((p) => (
          <motion.span
            layout
            key={p.name}
            initial={reduceMotion ? false : { scale: 0, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { scale: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 420, damping: 20 }}
            className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border-2 border-background text-sm font-semibold"
            style={{ backgroundColor: `color-mix(in srgb, ${p.color} 26%, hsl(var(--background)))`, color: p.color }}
          >
            <PickFace pick={p} iconClass="h-4 w-4" />
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

function PhotoTiles({
  list,
  kind,
  covers,
  counts,
  selected,
  onToggle,
  onRetry,
  reduceMotion,
}: Readonly<{
  list: CategoryNames;
  kind: "place" | "business";
  covers: Covers;
  counts: Counts;
  selected: string[];
  onToggle: (name: string) => void;
  onRetry: () => void;
  reduceMotion: boolean | null;
}>) {
  const grid = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4";
  if (list.status === "loading") {
    return (
      <div className={grid}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-lg" />
        ))}
      </div>
    );
  }
  if (list.status === "error" || list.items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-base text-muted-foreground">
          {list.status === "error"
            ? "We couldn't load the categories. Check your connection and try again, or skip setup and choose them later in Profile."
            : "Categories will appear here once they're added. You can skip setup for now."}
        </p>
        {list.status === "error" && (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  // The three categories with the most listings (at least three), flagged as
  // a starting point. Real counts, not a guess.
  const lots = new Set(
    list.items
      .map((i) => ({ name: i.name, n: counts.get(`${kind}:${i.name}`) ?? 0 }))
      .filter((c) => c.n >= 3)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map((c) => c.name)
  );

  return (
    <div className={grid}>
      {list.items.map((item, index) => (
        <PhotoTile
          key={item.name}
          item={item}
          cover={covers.get(`${kind}:${item.name}`)}
          lots={lots.has(item.name)}
          selected={selected.includes(item.name)}
          index={index}
          onToggle={onToggle}
          reduceMotion={reduceMotion}
        />
      ))}
    </div>
  );
}

// Eight flat specks fly out from a tile the moment it is selected.
function Burst({ color }: Readonly<{ color: string }>) {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-2 w-2 rounded-lg"
            style={{ backgroundColor: color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * 64, y: Math.sin(a) * 64, opacity: 0, scale: 0.3 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        );
      })}
    </>
  );
}

function PhotoTile({
  item,
  cover,
  lots,
  selected,
  index,
  onToggle,
  reduceMotion,
}: Readonly<{
  item: CategoryItem;
  cover: string | undefined;
  lots: boolean;
  selected: boolean;
  index: number;
  onToggle: (name: string) => void;
  reduceMotion: boolean | null;
}>) {
  const { Icon } = item;
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(item.name)}
      initial={reduceMotion ? false : { opacity: 0, y: 28, rotate: index % 2 ? 3 : -3, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 18, delay: Math.min(index, 14) * 0.045 }}
      whileHover={reduceMotion ? undefined : { y: -5, rotate: index % 2 ? 1.2 : -1.2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.95 }}
      className="relative aspect-[4/5] rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {selected && <Burst color={item.color} />}
      <motion.span
        animate={reduceMotion ? undefined : { scale: selected ? [1, 1.05, 1] : 1 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "flex h-full w-full flex-col overflow-hidden rounded-lg bg-card",
          selected ? "ring-2 ring-primary" : "ring-1 ring-border"
        )}
      >
        <span
          className="relative flex flex-1 items-center justify-center overflow-hidden"
          style={{ backgroundColor: `color-mix(in srgb, ${item.color} 24%, hsl(var(--background)))` }}
        >
          {cover ? (
            <motion.img
              src={cover}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
              animate={{ scale: selected ? 1.12 : 1 }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
            />
          ) : (
            <motion.span
              aria-hidden="true"
              animate={{ scale: selected ? 1.2 : 1, rotate: selected ? -6 : 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 12 }}
            >
              <Icon className="h-12 w-12" style={{ color: item.color }} />
            </motion.span>
          )}
          {lots && (
            <span className="absolute left-2 top-2 rounded-lg bg-background px-2 py-0.5 text-sm font-semibold text-foreground">
              Lots to explore
            </span>
          )}
          <AnimatePresence>
            {selected && (
              <motion.span
                initial={reduceMotion ? false : { scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={reduceMotion ? undefined : { scale: 0, rotate: 90 }}
                transition={{ type: "spring", stiffness: 500, damping: 16 }}
                className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              >
                <Check weight="bold" className="h-4 w-4" aria-hidden="true" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className="relative overflow-hidden bg-card px-3 py-2.5">
          <AnimatePresence>
            {selected && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 origin-bottom bg-primary"
                initial={reduceMotion ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                exit={reduceMotion ? undefined : { scaleY: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
          </AnimatePresence>
          <span className={cn("relative block text-sm font-semibold transition-colors duration-200", selected ? "text-primary-foreground" : "text-foreground")}>
            {item.name}
          </span>
        </span>
      </motion.span>
    </motion.button>
  );
}
