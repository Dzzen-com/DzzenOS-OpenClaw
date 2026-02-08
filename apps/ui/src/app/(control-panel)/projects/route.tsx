import { lazy } from 'react';
import { FuseRouteItemType } from '@fuse/utils/FuseUtils';

const ProjectsView = lazy(() => import('./components/views/ProjectsView'));

const route: FuseRouteItemType = {
	path: 'projects',
	element: <ProjectsView />
};

export default route;
