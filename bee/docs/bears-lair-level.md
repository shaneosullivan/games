# Bears Lair Level

After the user completes the Maze, they unlock the next level the Bears Lair, which should be auto selected when they show the menu after completing the maze.

The bears lair is similar to Flappy Bird (see https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/002/474/827/datas/original.jpg)
It is a 2d side scroller where there are obstacles coming from the top and bottom of the screen, in our case they are either
stalactites and stalagmites, or outcroppings of rock.  
The control is simply a press on the screen which makes the bee go higher, and letting go makes it fall back down, all the while moving to the right.
Use the same 3d rendering, just place the camera to the bee's left, and render the obstacles to it looks 2d.

At the beginning, show the bee in the normal 3d mode facing a large cave mouth with the first few obstacles rendered. The bee is flown in automatically after a 2 second pause,
then the camera pans around to the side for the 2d scroller effect.  
The game level should last about 60 seconds and not be too difficult for a young child to figure out.  If they collide with an obstacle, 
shake the screen like an earthquake and the bee should fall vertically down off the bottom of the screen, then show a notice consoling them and offering
two choices, 
- try again
- back to the menu