// React is not installed here: the engine knows `Component` by the module its import names.
import { Component } from "react";

// `this.setState(x)` in a class component: React merges `x`, or what an
// updater returns, into `state`, so a read of `this.state` sees it. The
// call itself holds nothing. The updater's parameter is the current state.
export class Counter extends Component<{ step: number; label: string }, { count: number; label: string }> {
  state = { count: 0, label: "" };
  bump = () => this.setState((prev) => ({ count: prev.count + this.props.step })); // @trace set-updater forward this.props.step @outcome set-updater ok @no-edge set-updater * * external-call
  rename() {
    this.setState({ label: this.props.label }); // @trace set-object forward this.props.label @outcome set-object ok
  }
  render() {
    return <button onClick={this.bump}>{this.state.count}{this.state.label}</button>; // @reaches set-updater,set-object render-terminal
  }
}

// A class that is no React component, with a `setState` of its own: the
// call runs that method, and `state` is a plain member.
export class Machine {
  state = { phase: "" };
  setState(next: { phase: string }) {
    console.log(next.phase); // @reaches own-set stdout @reaches own-set external-effect
  }
  advance(phase: string) { // @trace own-set forward symbol phase @outcome own-set ok
    this.setState({ phase });
  }
  read() {
    return this.state.phase; // @never-reaches own-set
  }
}
