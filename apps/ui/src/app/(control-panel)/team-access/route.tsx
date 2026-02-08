import { lazy } from 'react';
import { FuseRouteItemType } from '@fuse/utils/FuseUtils';

const TeamAccessView = lazy(() => import('./components/views/TeamAccessView'));

const route: FuseRouteItemType = {
	path: 'team-access',
	element: <TeamAccessView />
};

export default route;
