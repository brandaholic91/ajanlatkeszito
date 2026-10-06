// Hibaüzenet. A role="alert" miatt a képernyőolvasó is azonnal felolvassa.
import { AlertIcon } from "./Icons";

export function ErrorMessage({ message }: { message: string }) {
  return (
    <p role="alert" className="flex gap-2.5 rounded-md border border-error-line bg-error-soft p-3 text-error">
      <AlertIcon />
      <span>{message}</span>
    </p>
  );
}
