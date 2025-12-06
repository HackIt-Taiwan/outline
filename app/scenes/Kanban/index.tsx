import { StaticContext } from "react-router";
import { RouteComponentProps } from "react-router-dom";
import DataLoader from "~/scenes/Document/components/DataLoader";
import KanbanBoard from "./components/BoardView";

type Params = {
  documentSlug: string;
};

type LocationState = {
  title?: string;
};

export default function KanbanScene(
  props: RouteComponentProps<Params, StaticContext, LocationState>
) {
  return (
    <DataLoader {...props}>
      {({ document, abilities, readOnly }) => (
        <KanbanBoard
          document={document}
          abilities={abilities}
          readOnly={readOnly}
        />
      )}
    </DataLoader>
  );
}
