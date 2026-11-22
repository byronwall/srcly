// Keyed stores (`keyed` rows): a write and a read join when they reach the
// same store with the same key. The store is the receiver (one query client,
// one browser storage) or, for a context, the providers above the reader. A
// constant key joins; a computed key may be any key, so its join is assumed;
// another key, another store or another context never joins.
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";
import { createContext, useContext } from "solid-js";
import "./query-core-kit";

const PROFILE = ["profile"] as const;

export function SaveProfile(props: { profile: string }) {
  const client: QueryClient = useQueryClient();
  // @trace profile-write forward props.profile @outcome profile-write ok
  return <button onClick={() => client.setQueryData(PROFILE, props.profile)}>save</button>; // @reaches profile-write external-effect @reaches profile-write return
}

export function ShowProfile() {
  const client: QueryClient = useQueryClient();
  return <b>{client.getQueryData<string>(["profile"])}</b>; // @reaches profile-write render-terminal @stop profile-write external-code external-read @edge profile-write context-value * framework-state @no-edge profile-write * * computed-key
}

export function ShowOther() {
  const client: QueryClient = useQueryClient();
  return <i>{client.getQueryData<string>(["profiles"])}</i>; // @never-reaches profile-write,user-write
}

// A computed key (`["user", props.id]`) may be the key a read names, or not.
export function SaveUser(props: { id: string; user: string }) {
  const client: QueryClient = useQueryClient();
  // @trace user-write forward props.user @outcome user-write assumed
  return <button onClick={() => client.setQueryData(["user", props.id], props.user)}>save</button>; // @reaches user-write external-effect @reaches user-write return
}

export function ShowMe() {
  const client: QueryClient = useQueryClient();
  return <b>{client.getQueryData<string>(["user", "me"])}</b>; // @reaches user-write render-terminal @stop user-write external-code external-read @edge user-write context-value * computed-key
}

// Browser storage: one global store per name, keyed by the item's name.
export function remember(tab: string) { // @trace tab-write forward symbol tab @outcome tab-write ok
  localStorage.setItem("open-tab", tab); // @reaches tab-write external-effect
}

export function recall() {
  return localStorage.getItem("open-tab"); // @reaches tab-write return
}

export function recallSession() {
  return sessionStorage.getItem("open-tab"); // @never-reaches tab-write
}

// Two contexts never cross, and a reader under a provider never sees the default.
const Lang = createContext("en"); // @never-reaches lang-back
const Unit = createContext("en"); // @never-reaches lang-back

function LangRead() {
  const lang = useContext(Lang);
  return <b>{lang}</b>; // @trace lang-back backward lang @outcome lang-back partial @reaches lang-provided render-terminal @never-reaches unit-provided
}

function UnitRead() {
  const unit = useContext(Unit);
  return <i>{unit}</i>; // @reaches unit-provided render-terminal @never-reaches lang-provided
}

export function Settings(props: { lang: string; unit: string }) { // @stop lang-back untraced parameter
  return (
    <div>
      {/* @trace lang-provided forward props.lang @outcome lang-provided ok */}
      <Lang.Provider value={props.lang}>
        {/* @trace unit-provided forward props.unit @outcome unit-provided ok */}
        <Unit.Provider value={props.unit}><LangRead /><UnitRead /></Unit.Provider>
      </Lang.Provider>
    </div>
  );
}
