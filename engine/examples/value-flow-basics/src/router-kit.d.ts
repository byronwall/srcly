// A router's hooks with no body to read, as a package's declarations give them: the functions they hand back have no source.
export function useNavigate(): (to: string) => void;
export function useLabel(): () => string;
export function onSubmit(handler: (values: { name: string }) => void): void;
