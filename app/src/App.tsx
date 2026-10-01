import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { Landing } from './components/Landing';
import { JourneyExperience } from './components/JourneyExperience';
import { Destinations } from './components/Destinations';
import { JourneyHub } from './components/JourneyHub';
import { Passport } from './components/Passport';
import { Stories } from './components/Stories';
import { Plan } from './components/Plan';
import { Credits } from './components/Credits';
import { chapters } from './journey/ChapterNavigation';
import { AiGuide } from './components/AiGuide';
import { AuthStart } from './auth/AuthStart';
import { ResetPassword } from './auth/ResetPassword';
import { Admin } from './components/Admin';

const SharedExperience = lazy(() => import('./experience/SharedExperience').then(m => ({ default: m.SharedExperience })));
const DeAar = lazy(() => import('./components/DeAar').then(m => ({ default: m.DeAar })));
const CapeTownFinale = lazy(() => import('./components/CapeTownFinale').then(m => ({ default: m.CapeTownFinale })));
const Corridor = lazy(() => import('./components/Corridor').then(m => ({ default: m.Corridor })));
const AnimationRide = lazy(() => import('./components/AnimationRide').then(m => ({ default: m.AnimationRide })));
function LegacyRedirect({path}:{path:string}){useEffect(()=>{location.replace(path);},[path]);return <a href={path}>Open animation</a>;}
function LegacyTrail(){const [query]=useSearchParams();const path=chapters.find(c=>c.id===query.get('stop'))?.path??'/animation';return <LegacyRedirect path={path}/>;}
export default function App(){return <Routes><Route path="/experience/:town" element={<Suspense fallback={<p>Loading town...</p>}><SharedExperience/></Suspense>}/><Route path="/animation/:town" element={<Suspense fallback={<p>Loading town animation...</p>}><AnimationRide/></Suspense>}/><Route path="/trail" element={<Suspense fallback={<p>Loading connected journey...</p>}><LegacyTrail/></Suspense>}/><Route path="/de-aar" element={<Suspense fallback={<p>Loading De Aar?</p>}><DeAar/></Suspense>}/><Route path="/cape-town" element={<Suspense fallback={<p>Loading Cape Town?</p>}><CapeTownFinale/></Suspense>}/><Route path="/corridor" element={<Suspense fallback={<p>Loading corridor?</p>}><Corridor/></Suspense>}/><Route path="/animation" element={<Suspense fallback={<p>Loading animation studio...</p>}><AnimationRide/></Suspense>}/><Route path="/" element={<AuthStart/>}/><Route path="/login" element={<AuthStart/>}/><Route path="/reset-password" element={<ResetPassword/>}/><Route path="/admin" element={<Admin/>}/><Route path="/home" element={<Landing/>}/><Route path="/journey" element={<JourneyExperience/>}/><Route path="/ride" element={<Navigate to="/animation" replace/>}/><Route path="/app/*" element={<Navigate to="/animation" replace/>}/><Route path="/ai" element={<AiGuide/>}/><Route path="/destinations" element={<Destinations/>}/><Route path="/stops" element={<Destinations/>}/><Route path="/chapters" element={<JourneyHub/>}/><Route path="/passport" element={<Passport/>}/><Route path="/map" element={<Navigate to="/journey" replace/>}/><Route path="/stories" element={<Stories/>}/><Route path="/plan" element={<Plan/>}/><Route path="/credits" element={<Credits/>}/><Route path="*" element={<Landing/>}/></Routes>}
