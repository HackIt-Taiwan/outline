import { observer } from "mobx-react";
import { NavigationNode, PublicTeam, TOCPosition } from "@shared/types";
import DocumentModel from "~/models/Document";
import BoardView from "~/scenes/Kanban/components/BoardView";
import DocumentComponent from "~/scenes/Document/components/Document";
import { useDocumentContext } from "~/components/DocumentContext";
import { useTeamContext } from "~/components/TeamContext";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { parseDomain } from "@shared/utils/domains";
import useCurrentUser from "~/hooks/useCurrentUser";
import Branding from "~/components/Branding";

type Props = {
  document: DocumentModel;
  shareId: string;
  sharedTree?: NavigationNode;
};

function SharedDocument({ document, shareId, sharedTree }: Props) {
  const team = useTeamContext() as PublicTeam | undefined;
  const user = useCurrentUser({ rejectOnEmpty: false });
  const location = useLocation();
  const { hasHeadings, setDocument } = useDocumentContext();
  const abilities = useMemo(() => ({}), []);
  const isCustomDomain = useMemo(
    () => parseDomain(window.location.origin).custom,
    []
  );
  const showBranding = !isCustomDomain && !user;
  const isKanbanView =
    new URLSearchParams(location.search).get("view") === "kanban";

  const tocPosition = hasHeadings
    ? (team?.tocPosition ?? TOCPosition.Left)
    : false;
  setDocument(document);

  if (isKanbanView) {
    return (
      <BoardView
        document={document}
        abilities={{ share: false }}
        readOnly
        showDocumentLink={false}
      />
    );
  }

  return (
    <>
      <DocumentComponent
        abilities={abilities}
        document={document}
        sharedTree={sharedTree}
        shareId={shareId}
        tocPosition={tocPosition}
        readOnly
      />
      {showBranding ? (
        <Branding href="//www.getoutline.com?ref=sharelink" />
      ) : null}
    </>
  );
}

export const Document = observer(SharedDocument);
