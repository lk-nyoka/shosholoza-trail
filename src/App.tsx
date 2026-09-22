import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Home        from "./pages/Home";
const Journey = lazy(() => import("./pages/Journey"));
const Ride = lazy(() => import("./pages/Ride"));
import Destinations from "./pages/Destinations";
import Stories     from "./pages/Stories";
import AIGuide     from "./pages/AIGuide";
import Plan        from "./pages/Plan";
const LiveJourney = lazy(() => import("./pages/LiveJourney"));
import Credits     from "./pages/Credits";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "./components/layout/ErrorBoundary";
import UpdatePrompt from "./components/layout/UpdatePrompt";
import Privacy     from "./pages/Privacy";
import Help        from "./pages/Help";
import Start       from "./pages/Start";
import Trip        from "./pages/Trip";
import Song        from "./pages/Song";
import Operator    from "./pages/Operator";
import StopExperience from "./pages/StopExperience";

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <UpdatePrompt />
      <Suspense fallback={<div className="route-loading" role="status">Loading the corridor…</div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index            element={<Home />}         />
          <Route path="journey"   element={<Journey />}      />
          <Route path="ride"      element={<Ride />}         />
          <Route path="destinations" element={<Destinations />} />
          <Route path="stops/:stopId" element={<StopExperience />} />
          <Route path="stories"   element={<Stories />}      />
          <Route path="ai"        element={<AIGuide />}      />
          <Route path="plan"      element={<Plan />}         />
          <Route path="app"       element={<LiveJourney />}  />
          <Route path="credits"   element={<Credits />}      />
          <Route path="privacy"   element={<Privacy />}      />
          <Route path="help"      element={<Help />}         />
          <Route path="start"     element={<Start />}        />
          <Route path="trip"      element={<Trip />}         />
          <Route path="shosholoza" element={<Song />}        />
          <Route path="operator"  element={<Operator />}     />
          {/* legacy hash route → new path */}
          <Route path="*"         element={<NotFound />}     />
        </Route>
      </Routes>
      </Suspense>
    </HashRouter>
    </ErrorBoundary>
  );
}
