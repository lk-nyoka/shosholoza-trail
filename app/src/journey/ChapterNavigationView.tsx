import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {mountJourneyNavigation} from './ChapterNavigation';
export function ChapterNavigation(){const location=useLocation();useEffect(()=>mountJourneyNavigation(location.pathname),[location.pathname]);return null;}
