"""The routes that store designs and templates, and promote one into the other.

One table holds both kinds, so opening a document is a single code path and
the kind is a column rather than an address. The document itself is opaque
(ADR-0003): it goes into the column as it arrived and comes back out
unchanged, and the only thing this module ever reads inside it is the
`schemaVersion` it denormalizes.

Collections are Workspace-scoped, because a list is always one Workspace's.
Items are addressed by their own id and authorized by the Workspace on the
record, so a link to a document is a link to a document.
"""

from copy import deepcopy
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Request, params
from pydantic import BaseModel, ConfigDict, StringConstraints
from pydantic.alias_generators import to_camel
from sqlalchemy import select, update

from media_canvas_api.access import (
    Database,
    Editing,
    Now,
    Viewing,
    caller_in,
    refuse_unless,
)
from media_canvas_api.models import Document, DocumentKind, Role

router = APIRouter(prefix="/api/v1", tags=["documents"])

DocumentName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]

UNREACHABLE = "No such document."
CHANGED_ELSEWHERE = "This document has been saved by somebody else since you loaded it."
ALREADY_A_TEMPLATE = "Only a design can be promoted."
NOT_A_DOCUMENT = "The document must carry an integer schemaVersion."


class DocumentPayload(BaseModel):
    """The camelCase the editor reads, from the snake_case the table holds."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class DocumentSummary(DocumentPayload):
    """A stored document without the document — what one list row carries."""

    id: UUID
    kind: DocumentKind
    name: str
    schema_version: int
    revision: int
    promoted_from_id: UUID | None
    created_at: datetime
    updated_at: datetime


class DocumentView(DocumentSummary):
    """A stored document, whole — and the Workspace that owns it.

    The id is on the view and not the summary: a list is already read through
    one Workspace, so repeating it on every row would say nothing a caller
    does not already know. The editor is reached at the document's own url,
    and that page has only this answer for which Workspace to speak for.
    """

    workspace_id: UUID
    document: dict[str, Any]


class Saved(DocumentPayload):
    """What a save answers with: the revision it produced, and when."""

    revision: int
    updated_at: datetime


class NewDocument(BaseModel):
    """What creating takes. Only a design: promotion is the door to a template."""

    kind: Literal[DocumentKind.design]
    name: DocumentName
    document: dict[str, Any]


class Save(BaseModel):
    """What saving takes, including the Revision the caller loaded."""

    document: dict[str, Any]
    revision: int
    name: DocumentName | None = None


def holding(role: Role) -> params.Depends:
    """The gate every item route declares, in place of a lookup and a check.

    It resolves the document the path names together with the caller's rights
    over it, so a route that has run at all is looking at a document its
    caller may reach. Not being in the Workspace answers exactly what a
    missing document answers.
    """

    async def resolve(
        document_id: Annotated[UUID, Path(alias="documentId")],
        database: Database,
        request: Request,
    ) -> Document:
        document = await database.get(Document, document_id)
        if document is None:
            raise HTTPException(404, UNREACHABLE)
        membership = await caller_in(request, database, document.workspace_id)
        if membership is None:
            raise HTTPException(404, UNREACHABLE)
        refuse_unless(membership, role)
        return document

    return Depends(resolve)


Readable = Annotated[Document, holding(Role.viewer)]
Writable = Annotated[Document, holding(Role.editor)]


@router.post(
    "/workspaces/{workspaceId}/documents",
    status_code=201,
    operation_id="createDocument",
)
async def create_document(
    body: NewDocument, editor: Editing, database: Database, clock: Now
) -> DocumentView:
    """Create a design in this Workspace, at revision one."""
    now = clock()
    document = Document(
        workspace_id=editor.workspace_id,
        kind=DocumentKind.design,
        name=body.name,
        document=body.document,
        schema_version=schema_version_of(body.document),
        revision=1,
        created_at=now,
        updated_at=now,
    )
    database.add(document)
    await database.commit()
    return view_of(document)


@router.get("/workspaces/{workspaceId}/documents", operation_id="listDocuments")
async def list_documents(
    membership: Viewing, database: Database, kind: DocumentKind | None = None
) -> list[DocumentSummary]:
    """This Workspace's documents, newest change first, without their bodies.

    The whole list, every time: a Workspace holds the documents one team
    authors by hand, which is a number a person scrolls.
    """
    listed = select(Document).where(Document.workspace_id == membership.workspace_id)
    if kind is not None:
        listed = listed.where(Document.kind == kind)
    found = await database.scalars(
        listed.order_by(Document.updated_at.desc(), Document.id)
    )
    return [summary_of(document) for document in found]


@router.get("/documents/{documentId}", operation_id="getDocument")
async def get_document(document: Readable) -> DocumentView:
    """One document, whole. Any member of its Workspace may read it."""
    return view_of(document)


@router.put("/documents/{documentId}", operation_id="saveDocument")
async def save_document(
    body: Save, document: Writable, database: Database, clock: Now
) -> Saved:
    """Store a new version of a document against the Revision it was loaded at.

    The Revision is checked by the write itself rather than before it, so two
    saves that arrive together cannot both find the revision they expect.
    """
    changes: dict[str, Any] = {
        "document": body.document,
        "schema_version": schema_version_of(body.document),
        "revision": Document.revision + 1,
        "updated_at": clock(),
    }
    if body.name is not None:
        changes["name"] = body.name
    written = await database.execute(
        update(Document)
        .where(Document.id == document.id, Document.revision == body.revision)
        .values(**changes)
        .returning(Document.revision, Document.updated_at)
    )
    saved = written.one_or_none()
    if saved is None:
        raise HTTPException(409, CHANGED_ELSEWHERE)
    await database.commit()
    return Saved(revision=saved.revision, updated_at=saved.updated_at)


@router.post(
    "/documents/{documentId}/promote", status_code=201, operation_id="promoteDocument"
)
async def promote_document(
    design: Writable, database: Database, clock: Now
) -> DocumentView:
    """Copy a design into a new template, and answer with the copy.

    A copy, not a reference: from this moment the template and the design it
    came from change without each other, which is the whole point of
    promoting one.
    """
    if design.kind is DocumentKind.template:
        raise HTTPException(422, ALREADY_A_TEMPLATE)
    now = clock()
    template = Document(
        workspace_id=design.workspace_id,
        kind=DocumentKind.template,
        name=design.name,
        document=deepcopy(design.document),
        schema_version=design.schema_version,
        revision=1,
        promoted_from_id=design.id,
        created_at=now,
        updated_at=now,
    )
    database.add(template)
    await database.commit()
    return view_of(template)


@router.delete(
    "/documents/{documentId}", status_code=204, operation_id="deleteDocument"
)
async def delete_document(document: Writable, database: Database) -> None:
    """Delete a document.

    A template promoted from it stands on its own — it holds a copy, not a
    reference — and loses only the lineage back to what is gone.
    """
    await database.delete(document)
    await database.commit()


def schema_version_of(document: dict[str, Any]) -> int:
    """The one value the api copies out of a document, reading nothing else.

    ADR-0001 makes `schemaVersion` a required integer of every Design
    Document. Denormalizing it is what lets an operational question — which
    documents are still on an old version — be answered without opening one.
    """
    version = document.get("schemaVersion")
    if not isinstance(version, int):
        raise HTTPException(422, NOT_A_DOCUMENT)
    return version


def summary_of(document: Document) -> DocumentSummary:
    return DocumentSummary.model_validate(document, from_attributes=True)


def view_of(document: Document) -> DocumentView:
    return DocumentView.model_validate(document, from_attributes=True)
