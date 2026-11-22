// React is not installed here: the engine knows it by the module its imports name.
import { Component } from "react";

// React merges what a class component's static `getDerivedStateFromError`
// returns into its `state`, so a read of `this.state` sees it. A static
// method of the same name on a class that is no React component writes no
// state.
export class Boundary extends Component<{ children: string }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: Error) { // @trace derived-error forward symbol error @outcome derived-error ok
    return { message: error.message };
  }
  render() {
    return <p>{this.state.message ?? this.props.children}</p>; // @reaches derived-error render-terminal
  }
}

export class Plain {
  state = { message: "" };
  static getDerivedStateFromError(error: Error) { // @trace plain-error forward symbol error @outcome plain-error ok
    return { message: error.message }; // @reaches plain-error return
  }
  read() {
    return this.state.message; // @never-reaches plain-error
  }
}
