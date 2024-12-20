'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/lib/hooks/use-toast"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Territory, Player, InitialPlayers } from '@/lib/types/game'
import GameStatus from '@/components/gamePlay/GameStatus'
import ChatSystem from '@/components/gamePlay/ChatSystem'
import GameMap from '@/components/gamePlay/GameMap'
import { get2DGrid, addressToId } from '@/lib/hooks/ReadGameContract'
import { useAccount } from 'wagmi'
import { useMakeMove } from '@/lib/hooks/useMakeMove'
import { useGameAddress } from '@/lib/hooks/useGameAddress'
import { useGameStateUpdates } from '@/lib/hooks/useGameStateUpdates'
import { useWatchContractEvent } from "wagmi";
import { gameAbi } from '@/lib/contract/gameAbi'

export default function DiplomacyGame({ gameAddressParam }: { gameAddressParam: `0x${string}` }) {
    const { gameAddress } = useGameAddress();
    const { gameState, gameStatusLoading, error, refreshGameState } = useGameStateUpdates(gameAddressParam);
    const [territories, setTerritories] = useState<Territory[][]>([])
    const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null)
    const [currentUnits, setCurrentUnits] = useState<number>(0)
    const [moveStrength, setMoveStrength] = useState<number>(0)
    const [players, setPlayers] = useState<Player[]>(InitialPlayers)
    const [executionRecord, setExecutionRecord] = useState<string[]>([])
    const [moveSubmitted, setMoveSubmitted] = useState<boolean>(false)
    const [playerId, setPlayerId] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const { toast } = useToast()
    const { address } = useAccount()
    const { makeMove, error: makeMoveError, isConfirmed, isConfirming } = useMakeMove()

    useWatchContractEvent({
        address: gameAddressParam,
        abi: gameAbi,
        eventName: 'RoundCompleted',
        onLogs: () => {
            getGrids();
            getPlayerId();
            refreshGameState();
        },
    });

    const getGrids = async () => {
        setIsLoading(true)
        try {
            if (!gameAddress) return;
            const gridData = await get2DGrid(gameAddress);
            if (!gridData) return;
            const newGridData = (gridData as any[][]).map((row: any[], rowIndex: number) =>
                row.map((territory: any, colIndex: number) => ({
                    ...territory,
                    x: rowIndex,
                    y: colIndex,
                }))
            );
            setTerritories(newGridData as Territory[][]);
        } catch (error) {
            console.error('Error fetching grid:', error);
            toast({
                title: "Error",
                description: "Failed to fetch game state",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false)
        }
    };

    const getPlayerId = async () => {
        if (!gameAddress || !address) return;
        const playerId = await addressToId(gameAddress, address);
        setPlayerId(playerId as string);
    }


    useEffect(() => {
        getGrids();
        getPlayerId();
    }, [address, gameAddress, toast, isConfirmed]);


    const handleTerritoryClick = (territory: Territory) => {
        if (territory.player !== address) {
            toast({
                title: "Invalid Selection",
                description: "You can only select territories that belong to you",
                variant: "destructive",
            });
            return;
        }
        console.log("Territory clicked:", territory);

        setSelectedTerritory(territory);
        setMoveStrength(0);
        setCurrentUnits(Number(territory.units[Number(playerId)]));
    }

    const getAdjacentTerritories = (territory: Territory): Territory[] => {
        if (!territory) return [];
        const adjacentTerritories: Territory[] = [];

        territories.forEach((row, i) => {
            if (!row) return;
            row.forEach((currentTerritory, j) => {
                if (!currentTerritory) return;

                const dx = Math.abs(territory.x - currentTerritory.x);
                const dy = Math.abs(territory.y - currentTerritory.y);
                if (dx + dy === 1) {
                    adjacentTerritories.push(currentTerritory);
                }
            });
        });

        return adjacentTerritories;
    };

    const handleAction = async (targetTerritory: Territory) => {
        if (!selectedTerritory || !address || !gameAddress) {
            toast({
                title: "Invalid Action",
                description: "Cannot perform this action at this time.",
                variant: "destructive",
            });
            return;
        }

        try {
            type Move = readonly [number, number, string, number, number, number];
            const move: Move = [
                selectedTerritory.x,
                selectedTerritory.y,
                address,
                targetTerritory.x,
                targetTerritory.y,
                moveStrength
            ] as const;

            await makeMove(gameAddress, move);

            if (isConfirmed) {
                await refreshGameState();
                setMoveSubmitted(true);
                toast({
                    title: "Move Submitted",
                    description: "Your move has been submitted to the blockchain",
                });
                setMoveStrength(0);
            }

        } catch (error) {
            console.error('Error making move:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to submit move to the blockchain",
                variant: "destructive",
            });
        }
    };

    if (makeMoveError) {
        console.error("Error making move:", makeMoveError);
    }

    const handleSendMessage = (recipientId: string, content: string) => {
        console.log(`Message sent to ${recipientId}: ${content}`)
        toast({
            title: "Message Sent",
            description: `Your message has been sent to ${players.find(p => p.id === recipientId)?.name}.`,
        })
    }


    return (
        <div className="flex flex-col min-h-screen mt-12">
            <div className="flex flex-1 h-[calc(100vh-2rem)]">
                <div className="flex-1 p-4 overflow-auto">
                    <Tabs defaultValue="map" className="w-full h-full flex flex-col">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="map">Game Map</TabsTrigger>
                            {/* <TabsTrigger value="chat">Diplomacy Chat</TabsTrigger> */}
                        </TabsList>
                        <TabsContent value="map" className="flex-1">
                            <GameMap
                                currentPlayerId={playerId ?? ''}
                                currentPlayer={address ?? ''}
                                territories={territories}
                                onTerritoryClick={handleTerritoryClick}
                                isLoading={isLoading}
                            />
                        </TabsContent>
                        <TabsContent value="chat" className="flex-1">
                            <ChatSystem
                                players={players}
                                currentPlayerId={address ?? ''}
                                onSendMessage={handleSendMessage}
                            />
                        </TabsContent>
                    </Tabs>
                </div>
                <div className="w-1/3 p-4 space-y-4 overflow-auto">
                    <GameStatus currentPlayer={address ?? ''} players={players} moveAction={isConfirmed} />

                    <Card>
                        <CardHeader>
                            <CardTitle>Territory Information</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {selectedTerritory ? (
                                <div>
                                    <h3 className="text-lg font-bold mb-2">{selectedTerritory.name}</h3>
                                    <p className="mb-2">Type: {selectedTerritory.isCastle ? 'castle' : 'land'}</p>
                                    <div className="space-y-4">
                                        <div>
                                            <Label htmlFor="moveStrength">Units to Move:</Label>
                                            <div className="flex gap-2 mt-1">
                                                <Input
                                                    id="moveStrength"
                                                    type="number"
                                                    min={1}
                                                    value={moveStrength ?? ''}
                                                    max={currentUnits}
                                                    onChange={(e) => setMoveStrength(Number(e.target.value))}
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <Label>Select Destination:</Label>
                                            <p className="text-sm text-muted-foreground mb-2">
                                                Current Location: ({selectedTerritory.x}, {selectedTerritory.y})
                                            </p>
                                            <div className="grid gap-2 mt-1">
                                                {getAdjacentTerritories(selectedTerritory).map(territory => (
                                                    <Button
                                                        key={`${territory.x}-${territory.y}`}
                                                        className="w-full"
                                                        onClick={() => handleAction(territory)}
                                                        disabled={!moveStrength || moveStrength <= 0 || moveSubmitted}

                                                    >
                                                        {isConfirmed ? `Making the move to ${territory.x}, ${territory.y}` : `Move ${moveStrength} units to ${territory.x}, ${territory.y}`}
                                                        {isConfirming && <span className="animate-pulse">...</span>}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p>Select a territory to view information and perform actions.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}