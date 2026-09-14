import { Link } from "react-router-dom";
import "./Song.css";

/**
 * The song the app is named after.
 *
 * Everything on this page is documented and attributed, and where the record
 * disagrees with itself — which it does, about where the train in the song is
 * going — the page says so rather than picking the tidier version. There is no
 * recording here: we have not licensed one, and a page about a work song is not
 * improved by a piece of music we do not have the right to play.
 */
const img = (file: string, width = 1200) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${
    encodeURIComponent(file).replace(/\(/g, "%28").replace(/\)/g, "%29")
  }?width=${width}`;

export default function Song() {
  return (
    <div className="song-page">
      <div className="song-hero">
        <img
          src={img("Shosholoza Meyl-001.jpg", 1600)}
          alt="A Shosholoza Meyl train"
          className="song-hero__img"
        />
        <div className="song-hero__wash" aria-hidden="true" />
        <div className="container song-hero__text">
          <p className="t-eyebrow">The song</p>
          <h1 className="t-display t-display--lg song-hero__title">Shosholoza</h1>
          <p className="song-hero__sub">
            The line is named after a work song about a train. This is where it comes from.
          </p>
        </div>
      </div>

      <div className="container song-body">
        <section className="song-section">
          <h2 className="t-heading t-heading--lg">What the word means</h2>
          <p>
            <b>Shosholoza</b> is Ndebele for <i>go forward</i>, or <i>make way for the next
            man</i> — said as encouragement, to someone working. The repeated <i>sho sho</i> is
            the sound of a steam engine. <b>Stimela</b>, in the next line, is the Nguni word for
            that steam train.
          </p>
          <blockquote className="song-quote">
            <p lang="zu">Shosholoza<br />Kulezo ntaba<br />Stimela siphume South Africa</p>
            <p className="song-quote__gloss">
              Go forward · on those mountains · the train comes from South Africa
            </p>
          </blockquote>
          <p>
            Older versions sing <i lang="zu">stimela siphume Rhodesia</i> — the train from
            Rhodesia, now Zimbabwe.
          </p>
        </section>

        <section className="song-section">
          <h2 className="t-heading t-heading--lg">Who sang it</h2>
          <p>
            It is an Nguni song, mixing Zulu and Ndebele, and Zimbabwean in origin: Ndebele
            workers sang it travelling by steam train to the South African mines. Men sang it
            in call and response while they worked, one voice leading and the rest answering,
            the rhythm doing what a rhythm does to heavy work.
          </p>
          <p>
            Where the train in the song is going is genuinely disputed. Some hold that it
            describes the journey down to the mines; others that it describes the journey home.
            The song has been sung both ways for a century and this app is not going to settle
            it.
          </p>
        </section>

        <section className="song-section">
          <h2 className="t-heading t-heading--lg">What it became</h2>
          <p>
            Nelson Mandela described prisoners singing it on Robben Island — a song, he said,
            that compares the struggle against apartheid to the motion of an oncoming train,
            and that made the work lighter. It carried out of the mines and the prisons into
            stadiums, and after 1995 most of the country knew it.
          </p>
        </section>

        <section className="song-section">
          <h2 className="t-heading t-heading--lg">Why it is on this line</h2>
          <p>
            The passenger service between Johannesburg and Cape Town is called Shosholoza Meyl.
            The name is not decoration: this corridor is the one the song is about — rails laid
            for gold and diamonds, and the men who travelled them to reach the work. When you
            pass the mine dumps east of Johannesburg, or sit at Kimberley beside the Big Hole,
            you are on the route that produced it.
          </p>
          <figure className="song-figure">
            <img
              src={img("Shosholoza Meyl train at the Kraaifontein station.jpg")}
              alt="A Shosholoza Meyl train at Kraaifontein station"
              loading="lazy"
            />
            <figcaption>A Shosholoza Meyl service at Kraaifontein, outside Cape Town.</figcaption>
          </figure>
        </section>

        <section className="song-section song-section--note">
          <h2 className="t-heading t-heading--md">About a recording</h2>
          <p>
            There is no recording on this page. We would rather carry a version sung by people
            along this route, recorded and licensed properly, than a track we have no right to
            play. That is the next thing to add here.
          </p>
        </section>

        <p className="song-source">
          Sources: the documented history of the song, and photographs from{" "}
          <a href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer">
            Wikimedia Commons
          </a>{" "}
          — see <Link to="/credits">credits</Link>. Where accounts differ, this page says so.
        </p>
      </div>
    </div>
  );
}
