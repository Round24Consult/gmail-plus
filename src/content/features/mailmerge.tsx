import { render } from 'preact';
import { ROUTES } from '../../config';
import type { Ctx } from '../context';
import { MergeWizard } from '../ui/MergeWizard';

export function registerMailMerge(ctx: Ctx): void {
  ctx.sdk.Router.handleCustomRoute(ROUTES.merge, (routeView) => {
    const el = routeView.getElement();
    routeView.setFullWidth(true);
    render(<MergeWizard ctx={ctx} />, el);
    routeView.once('destroy', () => render(null, el));
  });
}
