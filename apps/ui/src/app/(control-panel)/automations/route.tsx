import { lazy } from 'react';
import { FuseRouteItemType } from '@fuse/utils/FuseUtils';

const AutomationsView = lazy(() => import('./components/views/AutomationsView'));

const route: FuseRouteItemType = {
	path: 'automations',
	element: <AutomationsView />
};

export default route;
