import { lazy } from 'react';
import { FuseRouteItemType } from '@fuse/utils/FuseUtils';

const AgentsView = lazy(() => import('./components/views/AgentsView'));

const route: FuseRouteItemType = {
	path: 'agents',
	element: <AgentsView />
};

export default route;
