// Az űrlap: a kérés szövege, az e-mail-cím, a példagomb és a beküldés.
// Saját állapota nincs: az értékeket a szülőtől (Demo) kapja, és a változást függvényhíváson át jelzi vissza.
import { MAX_TEXT_LENGTH } from "@/lib/validation";
import { SpinnerIcon } from "./Icons";

export const EXAMPLE_REQUEST =
  "Új irodát nyitunk 40 fővel. Kell 40 mobil-előfizetés, ebből 10 korlátlan adattal, gigabites internet, 15 laptop és céges levelezés.";

// A komponens bemenetei (props). Olyan, mint egy Python-függvény kulcsszavas paraméterei, típusokkal.
// Az "() => void" olyan függvényt jelent, amely nem ad vissza semmit.
type RequestFormProps = {
  text: string;
  email: string;
  disabled: boolean;
  submitting: boolean; // igaz, amíg a beküldő hívás úton van: ilyenkor a gombon forgó jel látszik
  onTextChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
};

export function RequestForm(props: RequestFormProps) {
  const { text, email, disabled, submitting, onTextChange, onEmailChange, onSubmit } = props;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        // A böngésző alapból újratöltené az oldalt az űrlap elküldésekor; ezt tiltjuk le.
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="request-text" className="font-semibold">
          Ajánlatkérés
        </label>
        <textarea
          id="request-text"
          className="field"
          rows={5}
          required
          maxLength={MAX_TEXT_LENGTH}
          placeholder="Írd le saját szavaiddal, mire kérsz ajánlatot…"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
        />
        <div>
          <button type="button" className="button-text" onClick={() => onTextChange(EXAMPLE_REQUEST)}>
            Példakérés beírása
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="request-email" className="font-semibold">
          E-mail-cím <span className="font-normal text-muted">(ide megy az ajánlat)</span>
        </label>
        <input
          id="request-email"
          className="field sm:max-w-sm"
          type="email"
          required
          autoComplete="email"
          placeholder="nev@ceg.hu"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
        />
      </div>

      <div>
        {/* aria-busy: a képernyőolvasónak is jelzi, hogy a gomb mögött éppen munka folyik. */}
        <button type="submit" className="button-primary w-full sm:w-auto" disabled={disabled} aria-busy={submitting}>
          {submitting && <SpinnerIcon />}
          Ajánlatot kérek
        </button>
      </div>
    </form>
  );
}
