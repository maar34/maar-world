/**
 * HELIX — the installation topology diagram, the repo's one React island.
 *
 * One export, not the usual two-to-six: the component takes no props and has no
 * variant axis. Its only states are interactive (a station node is focused or
 * selected), and those cannot render statically, so the canonical drawing in
 * its resting state is the whole honest story.
 */
import { HelixDiagram } from 'maar-world';

export const Diagram = () => <HelixDiagram />;
