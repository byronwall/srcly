// React is not installed here: the engine knows it by the module its imports name.
import { createContext, useContext } from "react";

// `useContext(Ctx)` returns the value of the nearest `Ctx` provider above the
// reader, or the context's default where no provider is above it. A provider
// whose subtree has no reader supplies nothing, and a context with an equal
// default is still another context.
const Color = createContext("plain"); // @visits default-back,loose-hook-back * ""plain"" @never-reaches outer-back * ""plain""
const Other = createContext("plain"); // @visits other-back * ""plain""

function InnerRead() {
  const color = useContext(Color);
  return <b>{color}</b>; // @reaches inner-provided render-terminal @never-reaches outer-provided,spare-provided
}
function OuterRead() {
  const color = useContext(Color);
  return <i>{color}</i>; // @reaches outer-provided render-terminal @never-reaches inner-provided,spare-provided @trace outer-back backward color
}
function DefaultRead() {
  const color = useContext(Color);
  return <u>{color}</u>; // @trace default-back backward color @outcome default-back ok @never-reaches inner-provided,outer-provided,spare-provided
}
function OtherRead() {
  const other = useContext(Other);
  return <s>{other}</s>; // @trace other-back backward other @outcome other-back ok @never-reaches inner-provided,outer-provided,spare-provided
}
// A hook that reads the context answers to the providers above the components
// that call it. Its one call serves every caller, so each caller may get what
// any of them is given: here the inner provider or the default.
function useShade() {
  return useContext(Color);
}
function HookRead() {
  const shade = useShade();
  return <em>{shade}</em>; // @reaches inner-provided render-terminal @never-reaches outer-provided,spare-provided
}
function LooseHook() {
  const shade = useShade();
  return <s>{shade}</s>; // @trace loose-hook-back backward shade @outcome loose-hook-back ok @reaches inner-provided render-terminal @never-reaches outer-provided,spare-provided
}
function Spare() {
  return <p>spare</p>;
}

export function Tree(props: { outer: string; inner: string; spare: string }) { // @stop outer-back untraced parameter
  return (
    <div>
      {/* @trace outer-provided forward props.outer */}
      <Color.Provider value={props.outer}>
        {/* @trace inner-provided forward props.inner */}
        <Color.Provider value={props.inner}><InnerRead /><HookRead /></Color.Provider>
        <OuterRead />
      </Color.Provider>
      {/* @trace spare-provided forward props.spare @stop spare-provided untraced jsx-occurrence */}
      <Color.Provider value={props.spare}><Spare /></Color.Provider>
      <DefaultRead />
      <OtherRead />
      <LooseHook />
    </div>
  );
}

// React 19 renders the context itself as its provider: `<Tone value>` is
// `<Tone.Provider value>`, and its value is no attribute on the page.
const Tone = createContext("quiet"); // @visits tone-default * ""quiet""
function ToneRead() {
  const tone = useContext(Tone);
  return <b>{tone}</b>; // @reaches tone-provided render-terminal
}
function ToneDefault() {
  const tone = useContext(Tone);
  return <i>{tone}</i>; // @trace tone-default backward tone @outcome tone-default ok @never-reaches tone-provided
}
export function ToneTree(props: { tone: string }) {
  return (
    <div>
      {/* @trace tone-provided forward props.tone @never-reaches tone-provided dom-attribute */}
      <Tone value={props.tone}><ToneRead /></Tone>
      <ToneDefault />
    </div>
  );
}

// A reader the program never mounts may sit under any provider, or none:
// every provider of its context and the default are candidates.
const Mood = createContext("calm"); // @visits mood-back * ""calm""
export function MoodRead() {
  const mood = useContext(Mood);
  return <b>{mood}</b>; // @reaches mood-provided render-terminal @trace mood-back backward mood @outcome mood-back ok
}
export function MoodTree(props: { mood: string }) {
  {/* @trace mood-provided forward props.mood */}
  return <Mood.Provider value={props.mood}><p>mood</p></Mood.Provider>;
}
