import { getLocale } from "next-intl/server";
import { en } from "../content/en";
import { pl } from "../content/pl";
import { getOperator } from "../operator";
import { LEGAL_VERSION, type LegalContent, type LegalDocumentKey } from "../types";

function contentFor(locale: string): LegalContent {
  return locale === "en" ? en : pl;
}

/** Title and lead of a document, for page metadata. */
export function legalMeta(locale: string, key: LegalDocumentKey) {
  const doc = contentFor(locale).documents[key];
  return { title: doc.title, description: doc.lead };
}

/** Fills {operator}, {address}, {email} and {version}; a missing operator detail is marked, not invented. */
function Filled({
  text,
  values,
  missing,
  fields,
}: {
  text: string;
  values: Record<string, string | null>;
  missing: string;
  fields: Record<string, string>;
}) {
  const parts = text.split(/(\{\w+\})/);
  return (
    <>
      {parts.map((part, i) => {
        const token = part.match(/^\{(\w+)\}$/)?.[1];
        if (!token || !(token in values)) return part;
        const value = values[token];
        if (value) {
          return token === "email" ? (
            <a key={i} href={`mailto:${value}`}>
              {value}
            </a>
          ) : (
            value
          );
        }
        return (
          <mark key={i} className="legal__missing">
            [{missing}: {fields[token] ?? token}]
          </mark>
        );
      })}
    </>
  );
}

/** One legal document: draft notice, contents, sections. Same layout for all four documents. */
export async function LegalPage({ document: key }: { document: LegalDocumentKey }) {
  const content = contentFor(await getLocale());
  const doc = content.documents[key];
  const values = { ...getOperator(), version: LEGAL_VERSION };
  const fill = (text: string) => (
    <Filled text={text} values={values} missing={content.missing} fields={content.fields} />
  );

  return (
    <article className="legal">
      <header className="legal__head">
        <h1 className="legal__title">{doc.title}</h1>
        <p className="legal__lead">{doc.lead}</p>
        <p className="legal__draft" role="note">
          {fill(content.draftNotice)}
        </p>
      </header>
      <nav aria-labelledby="legal-contents" className="legal__contents">
        <h2 id="legal-contents" className="legal__contents-title">
          {content.contents}
        </h2>
        <ol>
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      {doc.sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="legal__section">
          <h2 id={`${s.id}-title`} className="legal__section-title">
            {s.title}
          </h2>
          {s.blocks.map((block, i) =>
            typeof block === "string" ? (
              <p key={i}>{fill(block)}</p>
            ) : (
              <ul key={i}>
                {block.list.map((item, j) => (
                  <li key={j}>{fill(item)}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
    </article>
  );
}
