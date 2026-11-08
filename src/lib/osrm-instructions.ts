import type { RouteStep } from "@/lib/directions";

// Turn-by-turn phase 1: turns one OSRM step (RouteStep, directions.ts) into
// an English sentence, e.g. "Turn left onto Dr Garcia Street". Hand-written
// rather than pulling in Project OSRM's own osrm-text-instructions package:
// that package is built to cover every locale OSRM ships translations for
// and a long tail of maneuver/modifier combinations, for apps that need
// those languages. This app has one language and OSRM's vocabulary is
// small enough (the ~16 maneuver types and ~8 modifiers listed in their
// http.md) to cover directly, so a full localization library would be a
// large dependency for a feature this file implements in well under 100
// lines.
//
// Every branch below is read off OSRM's own documented maneuver vocabulary
// (project-osrm.org/docs/.../http.md "Step object"), not guessed: "depart",
// "arrive", "turn", "new name", "merge", "on ramp", "off ramp", "fork",
// "end of road", "continue", "roundabout", "rotary", "roundabout turn",
// "notification", "exit roundabout", "exit rotary", each cross-checked
// against a modifier where one applies ("uturn", "sharp right", "right",
// "slight right", "straight", "slight left", "left", "sharp left").

// A street's own name as OSRM reports it, or "" when the way is unnamed
// (an unnamed alley, a driveway). "onto {name}" would read as "onto " with
// nothing after it, so callers that want a name clause get one back only
// when there's a real name to say.
function namedClause(name: string): string {
  return name ? ` onto ${name}` : "";
}

// Sentence fragment: on-purpose shorter word choices than Google's own
// ("Head" vs "Head northeast on") since this app has no bearing/compass
// data to say which direction, only the street name.
function departSentence(step: RouteStep): string {
  return step.name ? `Head on ${step.name}` : "Head out";
}

function arriveSentence(): string {
  return "You have arrived at your destination";
}

// "turn"/"end of road"/"fork"/"merge"/"ramp" all reduce to the same
// "<Verb> <modifier>[, onto <name>]" shape once the modifier is read, which
// is why they share this one helper instead of five near-duplicate
// branches -- the only thing that differs between them is the verb.
function modifierSentence(verb: string, modifier: string | undefined, name: string): string {
  const direction = modifier ? MODIFIER_WORDS[modifier] ?? modifier : "";
  const directionClause = direction ? ` ${direction}` : "";
  return `${verb}${directionClause}${namedClause(name)}`;
}

// OSRM's own modifier strings (http.md) mapped to the word this app says.
// "straight" keeps its own word rather than folding into "Continue" here,
// since roundabout-turn and other callers below also read this table and
// expect a plain direction word back, not a full sentence.
const MODIFIER_WORDS: Record<string, string> = {
  uturn: "around, making a U-turn",
  "sharp right": "sharp right",
  right: "right",
  "slight right": "slightly right",
  straight: "straight",
  "slight left": "slightly left",
  left: "left",
  "sharp left": "sharp left",
};

// OSRM reports the roundabout/rotary exit number as step.exit (not part of
// RouteStep -- this app's parser (directions.ts's readSteps) doesn't carry
// it, since nothing before this file needed it). Exit-specific phrasing
// ("take the 2nd exit") is therefore out of reach here; roundabout
// instructions below say only direction, matching what RouteStep actually
// has.
function roundaboutSentence(modifier: string | undefined): string {
  const direction = modifier ? MODIFIER_WORDS[modifier] : undefined;
  return direction ? `Enter the roundabout and exit ${direction}` : "Enter the roundabout";
}

// Builds the sentence a step's maneuver type calls for. Any `type` this
// app's RouteStep received that isn't one of OSRM's documented values
// (readSteps in directions.ts lets an unrecognized string through rather
// than rejecting the whole route over it) falls through to the final
// default branch, a generic-but-always-true sentence, instead of throwing
// or rendering nothing for that row.
export function formatStepInstruction(step: RouteStep): string {
  switch (step.type) {
    case "depart":
      return departSentence(step);
    case "arrive":
      return arriveSentence();
    case "turn":
      return modifierSentence("Turn", step.modifier, step.name);
    case "new name":
      // OSRM uses this when the road keeps going straight but changes
      // name -- there is no turn to describe, only the new name.
      return step.name ? `Continue onto ${step.name}` : "Continue straight";
    case "continue":
      return modifierSentence("Continue", step.modifier, step.name);
    case "merge":
      return modifierSentence("Merge", step.modifier, step.name);
    case "on ramp":
      return modifierSentence("Take the ramp", step.modifier, step.name);
    case "off ramp":
      return modifierSentence("Take the exit", step.modifier, step.name);
    case "fork":
      return modifierSentence("Keep", step.modifier, step.name);
    case "end of road":
      return modifierSentence("Turn", step.modifier, step.name);
    case "roundabout":
    case "rotary":
      return roundaboutSentence(step.modifier);
    case "roundabout turn":
      return modifierSentence("At the roundabout, turn", step.modifier, step.name);
    case "exit roundabout":
    case "exit rotary":
      return step.name ? `Exit the roundabout onto ${step.name}` : "Exit the roundabout";
    case "notification":
      // OSRM's own catch-all for a step with no physical maneuver (a
      // waypoint pass-through); it carries no modifier worth reading.
      return step.name ? `Continue onto ${step.name}` : "Continue";
    default:
      // Unrecognized maneuver type (see the function-level note above):
      // still says something true about the step rather than nothing.
      return step.name ? `Continue onto ${step.name}` : "Continue";
  }
}
